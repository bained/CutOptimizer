# Алгоритъм за оптимизация на разкроя — Beam Search V6

## Преглед

Алгоритъмът използва **Beam Search** с **паралелни итерации** и **AFIT** (Area Fit) стратегия за разделяне на свободни правоъгълници. Портиран е от D кода в `d_port/Optimizer.d`.

## Структури от данни

```
Part        → { name, w, h, canRotate }
PlacedPart  → { name, x, y, w, h, rotated }
Rect        → { x, y, w, h }
Sheet       → { w, h, freeRects[], parts[], efficiency }
Layout      → { sheets[], score }
```

## Основен алгоритъм (`optimize()`)

```
За всяка итерация it (0..iterations-1):
  1. Копирай списъка с части
  2. Сортирай по стратегия:
     - it % 3 == 0: По площ (големите първи)
     - it % 3 == 1: По max страна (най-дългата страна)
     - it % 3 == 2: Random shuffle (Fisher-Yates)
  3. Стартирай beamSearch() с текущия ред
  4. Запази най-добрия Layout по score
```

## Beam Search (`beamSearch()`)

```
1. Инициализация: Layout с един празен Sheet
2. За всяка част (в сортиран ред):
   a. За всеки layout в текущия beam:
      i.   За всеки sheet в layout-а:
           - За всеки freeRect: опитай да поставиш частта (с/без ротация)
      ii.  Опиция: добави нов sheet и постави частта там
   b. Събери всички кандидати
   c. Сортирай по score (низходящо)
   d. Запази само top beamWidth кандидата
3. Върни най-добрия Layout
```

## Поставяне на част (`tryCandidate()`)

```
1. Вземи freeRect [x, y, w, h]
2. Ако частта не влиза → отказ
3. Клонирай layout
4. Постави частта в [r.x, r.y] с размери (pw, ph)
5. Извикай splitRects() за разделяне на свободните области
6. Извикай cleanRects() за премахване на дублирани rect-ове
7. Извикай finalize() за пресмятане на efficiency
8. Калкулирай gravityPenalty = sum((placed.x + placed.y) * 0.005)
9. score = evaluate() - gravityPenalty
```

## Разделяне на свободни правоъгълници (`splitRects()`)

Използва **AFIT** (Area Fit) стратегия:
- За всеки freeRect, който се припокрива с поставената част:
  - Създава до 4 нови правоъгълника: ляв, десен, горен, долен
  - Отчита kerf (дебелина на рязане) като добавя към размерите на частта

```
Ако част P(x,y,w,h) e в freeRect R(rx,ry,rw,rh):
  • Ляв:   [rx,  ry,  P.x - rx,             rh]
  • Десен: [P.x + pw, ry,  rx+rw - (P.x+pw), rh]
  • Горен: [rx,  ry,  rw,      P.y - ry]
  • Долен: [rx,  P.y + ph, rw, ry+rh - (P.y+ph)]
```

## Почистване на rect-ове (`cleanRects()`)

Премахва free rects, които са изцяло вътре в други free rects.

## Оценяване (`evaluate()`)

```
score = (10_000_000 / sheets.length) + sum(sheet.efficiency^2)
```

- **10 милиона бонус** за по-малко листове (приоритет)
- **Квадрат на ефективността** — насърчава равномерно запълване

## V6 Gravity Penalty

Добавя малка глоба за отдалечаване от (0,0):

```
gravityPenalty = sum((placed.x + placed.y) * 0.005)
```

Това подрежда частите плътно в долния ляв ъгъл, без да пречи на броя листове.