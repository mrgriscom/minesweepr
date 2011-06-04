import minesweeper as mnsw

def read_board(encoded_board, total_mines, everything_mode=False):
    board = Board(encoded_board)
    return generate_rules(board, total_mines, everything_mode)

class Board(object):
    def __init__(self, encoded):
        #. = blank; * = mine; x = unknown; N = count
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
    def __init__(self, c, name):
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

def _rule(mines, cells):
    if mines or cells:
        yield mnsw.Rule(mines, [cell.name for cell in cells])

# reference algorithm for generating input rules from a game state
def generate_rules(board, total_mines, everything_mode):
    clear_cells = set()
    zero_cells = set()
    relevant_mines = set()
    num_known_mines = 0

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
        rules.extend(_rule(0, zero_cells))

    num_irrelevant_mines = num_known_mines - len(relevant_mines)
    return (rules, mnsw.MineCount(board.total_cells() - (0 if everything_mode else len(clear_cells) + num_irrelevant_mines),
                                  total_mines - (0 if everything_mode else num_irrelevant_mines)))
