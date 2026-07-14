REM Optimizer:
ldc2 -O3 -release -link-defaultlib-shared=false Optimizer.d -L--no-as-needed -L-lz -L-ldl

REM VisualizerSVG:
ldc2 -O3 -release -link-defaultlib-shared=false VisualizerSVG.d -L--no-as-needed -L-lz -L-ldl -L-lpthread

REM VisualizerPNG:
ldc2 -O3 -release -link-defaultlib-shared=false VisualizerPNG.d -L--no-as-needed -L-lpthread -L-lm -L-lrt -L-ldl -L-lz -of=VisualizerPNG
