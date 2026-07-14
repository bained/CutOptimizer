import std.stdio;
import std.process;
import std.file;
import std.string;
import std.array;

void main() {
    // 1. Check if the VisualizerSVG binary exists
    if (!exists("./VisualizerSVG")) {
        writeln("Error: Binary './VisualizerSVG' not found.");
        writeln("Please compile the SVG visualizer first: ldc2 VisualizerSVG.d -of=VisualizerSVG");
        return;
    }

    // 2. Start VisualizerSVG as a subprocess
    // Redirect.stdin allows us to write to the process's input, which we receive from the Optimizer
    auto pipes = pipeProcess(["./VisualizerSVG"], Redirect.stdin);

    writeln("Processing: Piping data to SVG visualizer...");

    // 3. Read everything from our standard input and stream it to the subprocess input
    // byChunk is used for maximum performance and memory efficiency
    foreach (ubyte[] buffer; stdin.byChunk(4096)) {
        pipes.stdin.rawWrite(buffer);
    }

    // IMPORTANT: Close the subprocess stdin so it knows no more data is coming
    pipes.stdin.close();

    // Wait for the SVG visualizer to finish its task
    auto status = wait(pipes.pid);
    
    if (status != 0) {
        writeln("Error: SVG visualizer exited with code ", status);
        return;
    }

    // 4. Check for ImageMagick 'convert'
    // On newer systems, the command is 'magick', but 'convert' usually exists as a symlink
    string convertCmd = "convert";
    
    writeln("Generating PNG via ImageMagick...");
    
    try {
        auto convertPid = spawnProcess([convertCmd, "output.svg", "output.png"]);
        auto result = wait(convertPid);
        
        if (result == 0) {
            writeln("-----------------------------------------");
            writeln("SUCCESS! Project visualized:");
            writeln("1. Vector: output.svg");
            writeln("2. Raster: output.png");
            writeln("-----------------------------------------");
        } else {
            writeln("Error: 'convert' failed to process the file.");
        }
    } catch (ProcessException e) {
        writeln("Critical Error: 'convert' command not found.");
        writeln("Please install it using: sudo apt install imagemagick");
    }
}