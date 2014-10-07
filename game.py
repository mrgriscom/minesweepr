import random
import minesweeper_util as u
import minesweeper as mnsw

class MinesweeperGame(object):
    def __init__(self, num_mines=None, mine_prob=None):
        self.cell_ids = list(self.gen_cells())
        self.num_cells = len(self.cell_ids)

        assert num_mines is not None or mine_prob is not None
        if num_mines is not None:
            assert num_mines >= 0 and num_mines <= self.num_cells
            mines = [True] * num_mines + [False] * (self.num_cells - num_mines)
            random.shuffle(mines)
            self.mode = 'minecount'
        else:
            assert mine_prob >= 0. and mine_prob <= 1.
            mines = [random.random() < mine_prob for i in xrange(self.num_cells)]
            self.mode = 'mineprob'
            self.mine_prob = mine_prob
        self.num_mines = len(filter(None, mines))
        self.mines = dict((c, m) for c, m in zip(self.cell_ids, mines))

        self.cells = dict((c, None) for c in self.cell_ids)

        self.yet_to_uncover = self.num_cells - self.num_mines
        self.mine_exposed = False

    def outcome(self):
        if self.mine_exposed:
            return 'loss'
        elif self.yet_to_uncover == 0:
            return 'win'
        else:
            return None

    def can_play_cell(self, cell):
        """whether this cell can be cleared"""
        c = self.cells[cell]
        return (c is None or c == 'marked')

    def is_frontier_cell(self, cell):
        """whether this cell is represented by the 'other' term of the minesweeper solution"""
        return self.cells[cell] is None and all(self.cells[neighbor] in (None, 'marked') for neighbor in self.adjacent(cell))

    def sweep(self, cell):
        if not self.can_play_cell(cell):
            return
        if self.mines[cell]:
            self.mine_exposed = True
            return

        self.yet_to_uncover -= 1
        adj_count = len([c for c in self.adjacent(cell) if self.mines[c]])
        self.cells[cell] = adj_count
        if adj_count == 0:
            for neighbor in self.adjacent(cell):
                if self.can_play_cell(neighbor):
                    self.sweep(neighbor)

    def mark(self, cell):
        assert self.can_play_cell(cell)
        self.cells[cell] = 'marked'

    def gen_cells(self):
        assert False, 'abstract'

    def adjacent(self, cell_id):
        assert False, 'abstract'

class GridMinesweeperGame(MinesweeperGame):
    def __init__(self, width, height, *args, **kwargs):
        self.width = width
        self.height = height
        super(GridMinesweeperGame, self).__init__(*args, **kwargs)
    
    def gen_cells(self):
        for i in xrange(self.width):
            for j in xrange(self.height):
                yield (i, j)

    def adjacent(self, cell):
        i, j = cell
        for ni in xrange(i - 1, i + 2):
            for nj in xrange(j - 1, j + 2):
                if (ni >= 0 and ni < self.width and
                    nj >= 0 and nj < self.height and
                    (ni, nj) != (i, j)):
                   yield (ni, nj)

class BoardWrapper(object):
    """convert the gameboard to a form recognizable by the generate_rules() utility function"""

    def __init__(self, game):
        self.game = game

    def toCell(self, cell_id):
        cell = self.game.cells[cell_id]
        code = {
            None: 'x',
            'marked': '*',
            0: '.',
        }.get(cell, str(cell))
        return u.BoardCell(code, cell_id)

    @property
    def cells(self):
        return dict((k, self.toCell(k)) for k in self.game.cell_ids)
    
    def total_cells(self):
        return self.game.num_cells

    def adjacent(self, cell_id):
        return dict((k, self.toCell(k)) for k in self.game.adjacent(cell_id))

def autoplay(game):
    moves = 0
    while True:
        #print game
        #print '----'
        result = game.outcome()
        if result is not None:
            return result, moves

        state = u.generate_rules(BoardWrapper(game), game.num_mines)
        if game.mode == 'mineprob':
            state[1] = game.mine_prob
        solution = mnsw.solve(*state)

        def _cells(cells):
            for c in cells:
                if c is not None:
                    yield c
                else:
                    for e in game.cell_ids:
                        if game.is_frontier_cell(e):
                            yield e
        def get_cells(p):
            EPSILON = 1e-6
            return _cells(k for k, v in solution.iteritems() if abs(v - p) < EPSILON)

        mines = get_cells(1.)
        safe = list(get_cells(0.))

        for c in mines:
            game.mark(c)
            #print 'marking', c
        if safe:
            for c in safe:
                game.sweep(c)
                #print 'clearing', c
        else:
            # find safest
            min_risk = min(solution.values())
            safest = list(get_cells(min_risk))

            """
            if moves == 0:
                OPENING_STRATEGY = None
                if OPENING_STRATEGY == 'corner':
                    safest = filter(lambda e: e[0] in (0, game.width - 1) and e[1] in (0, game.height - 1), safest)
                elif OPENING_STRATEGY == 'side':
                    safest = filter(lambda e: e[0] in (0, game.width - 1) or e[1] in (0, game.height - 1), safest)
                elif OPENING_STRATEGY == 'interior':
                    safest = filter(lambda e: e[0] not in (0, game.width - 1) and e[1] not in (0, game.height - 1), safest)
            """

            move = random.choice(safest)
            game.sweep(move)
            #print 'safest', move

        moves += 1

BEGINNER_OLD = lambda: GridMinesweeperGame(8, 8, num_mines=10)
BEGINNER = lambda: GridMinesweeperGame(9, 9, num_mines=10)
INTERMEDIATE = lambda: GridMinesweeperGame(16, 16, num_mines=40)
EXPERT = lambda: GridMinesweeperGame(16, 30, num_mines=99)

def trial(new_game, first_safe=True):
    total_games = 0
    total_wins = 0

    while True:
        result, moves = autoplay(new_game())
        loss_on_first_move = (result == 'loss' and moves == 1)
        if loss_on_first_move and first_safe:
            continue

        total_games += 1
        if result == 'win':
            total_wins += 1

        print total_games, total_wins, float(total_wins) / total_games
