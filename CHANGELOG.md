# Changelog

## [0.2.0] - Engine Core (Current)
- Пълен порт на Beam Search V6 от D в ES6 класове
- Създадени model класове: Rect, Part, PlacedPart, Sheet, Layout
- Създаден Optimizer с 3 стратегии за сортиране (площ, max страна, random)
- AFIT splitRects + cleanRects + gravity penalty (V6 score)
- Създаден ConfigManager за INI конфигурация
- Създаден ProjectManager за жизнен цикъл на проект
- Тест с kitchen_project.json — 22 части, 2 листа, 88.74% ефективност за 66ms

## [0.1.0] - Initial Setup
- Начална структура на проекта
- Дефиниране на правила за стила на писане (.clinerules)
- Създаване на проектна документация