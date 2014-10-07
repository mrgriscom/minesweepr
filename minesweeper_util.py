import minesweeper as mnsw

# utility / debugging code

def read_board(encoded_board, total_mines, everything_mode=False):
    """convert an ascii-art game board into the ruleset describing it"""
    board = Board(encoded_board)
    return generate_rules(board, total_mines, everything_mode)

def read_board_file(path, total_mines, everything_mode=False):
    """read a board from a file"""
    with open(path) as f:
        return read_board(f.read(), total_mines, everything_mode)

class Board(object):
    """simple representation of a game board (no actual game logic!)"""

    def __init__(self, encoded):
        """create a game board from an ascii-encoded description, where
        . = blank; * = mine; x = unknown; N = count

        e.g.:
          ...2x
          .113x
          .2*xx
          13*xx
          xxxxx
        """

        lines = [ln.strip() for ln in encoded.strip().split('\n')]
        self.height = len(lines)
        self.width = len(lines[0])

        self.cells = {}
        for row, ln in enumerate(lines):
            for col, c in enumerate(ln):
                pos = (row + 1, col + 1)
                self.cells[pos] = BoardCell(c, self.cell_name(*pos))

    def adjacent(self, (row, col)):
        for r in range(max(row - 1, 1), min(row + 2, self.height + 1)):
            for c in range(max(col - 1, 1), min(col + 2, self.width + 1)):
                pos = (r, c)
                if pos != (row, col):
                    yield (pos, self.cells[pos])

    def cell_name(self, r, c):
        return '%0*d-%0*d' % (len(str(self.height)), r, len(str(self.width)), c)

    def total_cells(self):
        return self.width * self.height

class BoardCell(object):
    """representation of a board cell"""

    def __init__(self, c, name):
        """create a cell from its ascii description"""
        self.name = name

        if c == '.':
            c = '0'

        try:
            self.type = 'clear'
            self.adj = int(c)
        except ValueError:
            self.type = {'*': 'mine', 'x': 'unkn'}[c]

    def is_mine(self):
        return self.type == 'mine'

    def is_unknown(self):
        return self.type == 'unkn'

    def __hash__(self):
        return hash(self.name)
    def __eq__(self, o):
        return self.name == o.name

def generate_rules(board, total_mines, everything_mode=False):
    """reference algorithm for generating input rules / mine_prevalence from a
    game state

    board -- game board object
    total_mines -- total # of mines on board
    everything_mode -- if False, only include 'interesting' rules, i.e., omit
        the parts of the board that have already been solved; if True, include
        rules to completely describe the state of the board (but still don't
        include _every_ possible rule, as this would include a huge number of
        degenerate / redundant rules). in general, invalid boards will only be
        detected by everything mode.

    in particular, in 'interesting mode':
      * create a rule for each 'number' cell that borders an uncovered cell
      * create a rule encompassing cells with known mines, including ONLY
        those cells which are referenced by the rules from the previous step
    in everything mode:
      * create a rule for each 'number' cell
      * create a rule encompassing all known mines
      * create a rule encompassing all uncovered cells
      * create a rule for all cells adjacent to 'blank'/'empty' cells, and not
        included in the previous rule. thus, this rule will only be present
        for invalid  boards or boards whose empty areas have not been fully
        expanded
    """

    def _rule(mines, cells):
        """rule-building helper; don't create degenerate rules

        we allow # mines > # cells, such as in the event of an invalid board"""
        if mines or cells:
            yield mnsw.Rule(mines, [cell.name for cell in cells])

    clear_cells = set()    # set of cells that have been unconvered
    zero_cells = set()     # set of cells adjacent to blank/empty/'zero' cells
    relevant_mines = set() # set of known mine cells that interest us
    num_known_mines = 0    # total number of known mines

    rules = []
    for cell_id, cell in board.cells.iteritems():
        if cell.is_mine():
            num_known_mines += 1
            if everything_mode:
                relevant_mines.add(cell)
        elif not cell.is_unknown():
            clear_cells.add(cell)
            neighbors = dict(board.adjacent(cell_id)).values()
            if cell.adj > 0:
                if any(nc.is_unknown() for nc in neighbors) or everything_mode:
                    rules.extend(_rule(cell.adj, [nc for nc in neighbors if nc.is_mine() or nc.is_unknown()]))
                    relevant_mines.update(nc for nc in neighbors if nc.is_mine())
            else:
                zero_cells.update(neighbors)

    rules.extend(_rule(len(relevant_mines), relevant_mines))
    if everything_mode:
        rules.extend(_rule(0, clear_cells))
        rules.extend(_rule(0, zero_cells - clear_cells))

    num_irrelevant_mines = num_known_mines - len(relevant_mines)
    mine_prevalence = mnsw.MineCount(
        board.total_cells() - (0 if everything_mode else len(clear_cells) + num_irrelevant_mines),
        total_mines - (0 if everything_mode else num_irrelevant_mines)
    )
    return (rules, mine_prevalence)
