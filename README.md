minesweepr
==========

This project is a minesweeper solver algorithm in python 3, along with an interactive demo / game engine written in javascript and HTML canvas. [Try it out!](http://mrgris.com/projects/minesweepr/demo/player/)

Solving
-------

To solve a board, you provide a number of 'rules' describing the game state, along with information about the board as a whole: total number of cells and total number of mines.

Each rule represents information gleaned from the uncovered cells of the board. A single `Rule` consists of a set of cells, along with how many mines are to be found among that set. So for a given uncovered cell (say we uncovered a 3), we'd generate: `Rule(3, [set of cells adjacent to the uncovered cell])`.

_Note that the solver doesn't have any concept of a grid or the board's geometry; it just knows about various sets of cells._

Let's try an example (forgive the ascii art):

    ..1Axxxxxx
    ..2Bxxxxxx
    ..3Cxxxxxx
    ..2Dxxxxxx
    112Exxxxxx
    IHGFxxxxxx
    xxxxxxxxxx
    xxxxxxxxxx
    xxxxxxxxxx
    xxxxxxxxxx

This is an easy-mode board: 10x10, 10 mines. We've assigned a unique tag (`A`, `B`, `C`, ...) to each covered cell next to the uncovered region (hereafter known as a "front" of play).

We solve as such:

    minesweeper.solve([
        Rule(1, ['A', 'B']),
        Rule(2, ['A', 'B', 'C']),
        Rule(3, ['B', 'C', 'D']),
        Rule(2, ['C', 'D', 'E']),
        Rule(2, ['D', 'E', 'F', 'G', 'H']),
        Rule(1, ['G', 'H', 'I']),
        Rule(1, ['H', 'I']),
    ], MineCount(total_cells=85, total_mines=10))

and get the result:

    {'A': 0.0,
     'B': 1.0,
     'C': 1.0,
     'D': 1.0,
     'E': 0.0,
     'F': 0.0779,
     'G': 0.0,
     'H': 0.9221,
     'I': 0.0779,
     None: 0.0779}

So we see that cells `B`, `C`, and `D` are mines; `A`, `E`, and `G` are clear; `H` is 92.21% likely to be a mine; and `F`, `I`, and all other cells (represented by tag `None`) are 7.79% likely to be mines.

One point of confusion is that `total_cells` in the above example is 85 instead of 100. This is because there are 15 uncovered cells that we did not include in any rule. Since the solver doesn't know anything about a 10x10 grid, we subtract these 15 from the total number of cells and the solver never needs to know they even exist. Alternatively, we could add a rule: `Rule(0, [set of all uncovered cells])` and set `total_cells` to 100, and the outcome would be the same. We could even naively make a separate `Rule` for every single uncovered cell, but that is cumbersome and inefficient.

In general, `total_cells` must equal the count of all uncovered cells plus all cells mentioned in a `Rule`. `total_mines` must equal the total number of mines minus any mines already identified and _not_ mentioned in any `Rule`.

You can see that the specific logic for generating the appropriate arguments to `solve()` is quite nuanced (assuming you're not taking the naive route). Luckily, utility code is provided that can do the processing for you. See `minesweeper_util.generate_rules()`. You can directly use the ascii-art format from above via `minesweeper_util.read_board()` (without the explicit tagging `A`, `B`, `C`, though; that was just for illustrative purposes).

The solver will also identify game states that are inconsistent/contradictory (i.e., have no possible solution) and raise an exception.

Interactive Demo
----------------

An interactive player is provided in `web_demo/` as a simple django project. To launch:

    python manage.py runserver

and then navigate to `http://localhost:8000/player/`.

All game logic and rendering is client-side javascript; the django app provides a simple web service to do the board solving.

Calls to the web service are terminated if they do not compute a result within a set amount of processing time (configurable in `settings.CPU_QUOTA`). This is necessary because solving minesweeper is inherently an exponential algorithm, and certain boards may take forever to solve.

I have not to date found any satisfactory solution for terminating a python CPU-intensive task after a set timeout, so currently every call to the web service is spawned off as a separate process (which can be terminated easily).

