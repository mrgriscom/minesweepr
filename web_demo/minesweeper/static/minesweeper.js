


function Board (width, height) {
  this.width = width;
  this.height = height;
  this.cells = [];

  this.populate_n = function (num_mines) {
    this.num_mines = num_mines;

    this.init(this.n_dist());
  }

  this.populate_p = function (mine_prob) {
    this.mine_prob = mine_prob;

    this.init(this.p_dist());
  }

  this.init = function (mine_dist) {
    for (var i = 0; i < mine_dist.length; i++) {
      this.cells.push(new Cell(null, mine_dist[i] ? 'mine' : null, false, false));
    }
    this.for_each_cell(function (r, c, cell, board) {
        cell.name = board.cell_name(r, c);
        if (cell.state != 'mine') {
          var count = 0;
          board.for_each_neighbor(r, c, function (r, c, neighb, board) {
              if (neighb.state == 'mine') {
                count++;
              }
            });
          cell.state = count;
        }
      });
  }

  this.uncover = function (r, c) {
    var cell = this.get_cell(r, c);
    if (!cell.visible) {
      cell.visible = true;

      if (cell.state == 'mine') {
        return false;
      } else {
        if (cell.state == 0) {
          this.for_each_neighbor(r, c, function (r, c, neighb, board) {
              board.uncover(r, c);
            });
        }
        return true;
      }
    }
  }

  this.flag = function (r, c) {
    this.get_cell(r, c).flagged = true;
  }

  this.cell_ix = function (r, c) {
    return r * this.width + c;
  }

  this.get_cell = function (r, c) {
    return this.cells[this.cell_ix(r, c)];
  }

  this.num_cells = function () {
    return this.width * this.height;
  }

  this.adjacent = function (r, c) {
    var adj = [];
    for (var _r = Math.max(r - 1, 0); _r <= Math.min(r + 1, height - 1); _r++) {
      for (var _c = Math.max(c - 1, 0); _c <= Math.min(c + 1, width - 1); _c++) {
        if (_r != r || _c != c) {
          adj.push({ix: {r: _r, c: _c}, cell: this.get_cell(_r, _c)});
        }
      }
    }
    return adj;
  }

  this.n_dist = function () {
    m = [];
    for (var i = 0; i < this.num_cells(); i++) {
      m[i] = (i < this.num_mines);
    }
    shuffle(m);
    return m;
  }

  this.p_dist = function () {
    m = [];
    for (var i = 0; i < this.num_cells(); i++) {
      m[i] = (Math.random() < this.mine_prob);
    }
    return m;
  }

  this.cell_name = function (r, c) {
    var pad_to = function (i, max) { return pad(i, ('' + max).length); };
    return pad_to(r, this.height) + '-' + pad_to(c, this.width);
  }

  this.safe_cell = function () {
    var c = [];
    this.for_each_cell(function (r, c, cell, board) {
        if (cell.state != 'mine') {
          c.push([r, c]);
        }
      });
    return c[Math.floor(Math.random() * c.length)];
  }

  this.cell_dim = function (canvas) {
    return Math.min(canvas.height / this.height, canvas.width / this.width);
  }

  this.render = function (canvas, params) {
    params = params || {};

    this.for_each_cell(function (r, c, cell, board) {
        cell.render(board.geom(r, c, canvas), canvas.getContext('2d'), params);
      });
  }

  this.render_overlay = function(r, c, fill, canvas) {
    this.get_cell(r, c).render_overlay(this.geom(r, c, canvas), fill, canvas.getContext('2d'));
  }

  this.geom = function (r, c, canvas) {
    var dim = this.cell_dim(canvas);
    var cell_width = dim - MARGIN;
    var corner = [c * dim, r * dim];
    var center = [corner[0] + .5 * cell_width, corner[1] + .5 * cell_width];
    return {span: cell_width, corner: corner, center: center};
  }

  this.cell_from_xy = function (p, canvas) {
    var dim = this.cell_dim(canvas);
    var r = Math.floor(p.y / dim);
    var c = Math.floor(p.x / dim);
    if (r >= 0 && r < this.height && c >= 0 && c < this.width) {
      var g = this.geom(r, c, canvas);
      var inside = (p.x - g.corner[0] < g.span && p.y - g.corner[1] < g.span);
      return {r: r, c: c, inside: inside};
    } else {
      return null;
    }
  }

  this.for_each_cell = function (func) {
    for (var r = 0; r < this.height; r++) {
      for (var c = 0; c < this.width; c++) {
        func(r, c, this.get_cell(r, c), this);
      }
    }
  }

  this.for_each_neighbor = function (r, c, func) {
    var adj = this.adjacent(r, c);
    for (var i = 0; i < adj.length; i++) {
      var neighb = adj[i];
      func(neighb.ix.r, neighb.ix.c, neighb.cell, this);
    }
  }

  this.for_each_name = function (names, func) {
    this.for_each_cell(function (r, c, cell, board) {
        if (names.indexOf(cell.name) != -1) {
          func(r, c, cell, board);
        }
      });
  }

  this.game_state = function (everything_mode) {
    var rules = [];
    var clear_cells = [];
    var zero_cells = [];
    var relevant_mines = [];
    var num_known_mines = 0;

    var mk_rule = function(num_mines, cells) {
      var rule = {num_mines: num_mines, cells: []};
      for (var i = 0; i < cells.length; i++) {
        rule.cells.push(cells[i].name);
      }
      return rule;
    }

    var add = function(set, elem) {
      if (set.indexOf(elem) == -1) {
        set.push(elem);
      }
    }

    this.for_each_cell(function (r, c, cell, board) {
        if (cell.state == 'mine' && cell.flagged) {
          num_known_mines += 1;
          if (everything_mode) {
            add(relevant_mines, cell);
          }
        } else if (cell.visible) {
          add(clear_cells, cell);
          if (cell.state > 0) {
            var cells_of_interest = [];
            var on_frontier = false;
            board.for_each_neighbor(r, c, function (r, c, neighbor, board) {
                if (!neighbor.visible || neighbor.state == 'mine') {
                  cells_of_interest.push(neighbor);
                  if (neighbor.state == 'mine' && neighbor.flagged) {
                    add(relevant_mines, neighbor);
                  } else if (!neighbor.visible) {
                    on_frontier = true;
                  }
                }
              });

            if (everything_mode || on_frontier) {
              rules.push(mk_rule(cell.state, cells_of_interest));
            }
          } else {
            board.for_each_neighbor(r, c, function (r, c, neighbor, board) {
                add(zero_cells, neighbor);
              });
          }
        }
      });

    for (var i = 0; i < relevant_mines.length; i++) {
      rules.push(mk_rule(1, [relevant_mines[i]]));
    }
    if (everything_mode) {
      rules.push(mk_rule(0, clear_cells));
      rules.push(mk_rule(0, zero_cells));
    }

    var num_irrelevant_mines = num_known_mines - relevant_mines.length;
    var state = {rules: rules, total_cells: this.num_cells() - (everything_mode ? 0 : clear_cells.length + num_irrelevant_mines)};
    if (this.num_mines != null) {
      state.total_mines = this.num_mines - (everything_mode ? 0 : num_irrelevant_mines);
    } else {
      state.mine_prob = this.mine_prob;
    }
    return state;
  }
}

function Cell (name, state, visible, flagged) {
  this.name = name;
  this.state = state;
  this.visible = visible;
  this.flagged = flagged;

  this.render = function (g, ctx, params) {
    ctx.fillStyle = (this.visible ? VISIBLE_BG : HIDDEN_BG);
    ctx.fillRect(g.corner[0], g.corner[1], g.span, g.span);

    if (this.state == 'mine') {
      ctx.fillStyle = (this.visible ? EXPLODED : MINE_FILL);
      ctx.beginPath();
      ctx.arc(g.center[0], g.center[1], .5 * g.span * MINE_RADIUS, 0, 2*Math.PI, false);
      if (this.flagged) {
        ctx.stroke();
      } else {
        ctx.fill();
      }
    } else if (this.state > 0 && this.visible) {
      var font_size = g.span * FONT_SIZE;
      ctx.fillStyle = COUNT_FILL[Math.min(this.state - 1, COUNT_FILL.length - 1)];
      ctx.font = font_size + 'pt sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('' + this.state, g.center[0], g.center[1] + font_size * FONT_OFFSET);
    }
  }

  this.render_overlay = function (g, fill, ctx) {
    ctx.fillStyle = fill;
    ctx.fillRect(g.corner[0], g.corner[1], g.span, g.span);
  }
}

HIDDEN_BG = 'rgb(200, 200, 200)';
VISIBLE_BG = 'rgb(230, 230, 230)';
MINE_FILL = 'rgba(0, 0, 0, .2)';
EXPLODED = 'rgba(255, 0, 0, .8)';
COUNT_FILL = ['blue', 'green', 'red', 'purple', 'brown', 'cyan', 'orange', 'black'];
MARGIN = 1;
MINE_RADIUS = .5;
FONT_SIZE = .5;
FONT_OFFSET = .1;

EPSILON = 1.0e-6;

function prob_shade (p) {
  if (p < EPSILON) {
    return 'rgba(0, 0, 255, .2)';
  } else if (p > 1 - EPSILON) {
    return 'rgba(255, 0, 0, .2)';
  } else {
    var MIN_ALPHA = .05;
    var MAX_ALPHA = .8;
    var alpha = MIN_ALPHA * (1 - p) + MAX_ALPHA * p;
    return 'rgba(0, 255, 0, ' + alpha + ')';
  }
}

function pad(i, n) {
  var s = '' + i;
  while (s.length < n) {
    s = '0' + s;
  }
  return s;
}

function mousePos(evt, elem) {
  return {x: evt.pageX - elem.offsetLeft, y: evt.pageY - elem.offsetTop};
}

function shuffle(data) {
  var buf = [];
  for (var i = 0; i < data.length; i++) {
    buf[i] = [Math.random(), data[i]];
  }
  buf.sort(function (a, b) { return a[0] - b[0]; });
  for (var i = 0; i < data.length; i++) {
    data[i] = buf[i][1];
  }    
}




function apply(board, cell_probs, func) {
  var names = [];
  for (var name in cell_probs) {
    names.push(name);
  }
  board.for_each_name(names, function (r, c, cell, board) {
      func(r, c, cell, cell_probs[cell.name], board);
    });
  
  var other_prob = cell_probs['_other'];
  if (other_prob != null) {
    board.for_each_cell(function (r, c, cell, board) {
        if (!cell.visible && names.indexOf(cell.name) == -1) {
          func(r, c, cell, other_prob, board);
        }
      });
  }
}

function render_overlays (board, cell_probs, canvas) {
  apply(board, cell_probs, function (r, c, cell, prob, board) {
      if (!cell.flagged) {
        board.render_overlay(r, c, prob_shade(prob), canvas);
      }
    });
}

function make_board (w, h, mine_factor, mine_mode) {
  mine_mode = mine_mode || (mine_factor >= 1. ? 'count' : 'prob');

  board = new Board(w, h);
  board[{'count': 'populate_n', 'prob': 'populate_p'}[mine_mode]](mine_factor);
  return board;
}

function solve(board, url, callback) {
  $.post(url, JSON.stringify(board.game_state()), function (data) {
      var solution = data.solution;
      if (solution['_other'] == null && board.mine_prob != null) {
        solution['_other'] = board.mine_prob;
      }
      
      callback(solution, board);
    }, "json");
}

function display_solution(cell_probs, board, canvas) {
  render_overlays(board, cell_probs, canvas);
  current_probs = cell_probs;
}

function action(board, cell_probs, canvas) {
  var must_guess = true;
  var guesses = [];
  var min_prob = 1.;
  var survived = true;
  apply(board, cell_probs, function (r, c, cell, prob, board) {
      if (prob < EPSILON) {
        board.uncover(r, c);
        must_guess = false;
      } else if (prob > 1. - EPSILON) {
        if (!cell.flagged && board.num_mines) {
          remaining_mines--;
        }
        board.flag(r, c);
      } else {
        guesses.push({r: r, c: c, p: prob});
        min_prob = Math.min(min_prob, prob);
      }
    });
  if (must_guess) {
    var best_guesses = [];
    for (var i = 0; i < guesses.length; i++) {
      if (guesses[i].p < min_prob + EPSILON) {
        best_guesses.push(guesses[i]);
      }
    }
    if (best_guesses.length) {
      // only occurs at the very end when all there is left to do is flag remaining mines
      shuffle(best_guesses);
      var guess = best_guesses[0];
      survived = board.uncover(guess.r, guess.c);
      total_risk = 1. - (1. - total_risk) * (1. - min_prob);
    }
  }
  board.render(canvas);
  return survived;
}

function update_stats() {
  $('#num_mines').text(remaining_mines);
  $('#risk').text((100. * total_risk).toFixed(2) + '%');
}

function go(board, canvas) {
  var survived = action(board, current_probs, canvas);
  update_stats();
  if (survived) {
    solve(board, SOLVE_URL, function (data, board) { display_solution(data, board, canvas); });
  }
}

SOLVE_URL = '/api/minesweeper_solve/';

$(document).ready(function(){
    //  netscape.security.PrivilegeManager.enablePrivilege("UniversalBrowserRead");

    canvas = $('#gameboard')[0];

    board = make_board(30, 16, 100);
    board.render(canvas);

    remaining_mines = board.num_mines || '??';
    total_risk = 0.;

    solve(board, SOLVE_URL, function (data, board) { display_solution(data, board, canvas); });

    $('#go').click(function () { go(board, canvas); });

    $("#tooltip").hide();
    $("#gameboard").mousemove(function(e){
        var coord = mousePos(e, canvas);
        var pos = board.cell_from_xy(coord, canvas);

        var prob = null;
        if (pos) {
          var cell = board.get_cell(pos.r, pos.c);
          prob = current_probs[cell.name];
          if (prob == null && !cell.visible && !cell.flagged) {
            prob = current_probs['_other'];
          }
        }
        if (prob > EPSILON && prob < 1. - EPSILON) {
          $("#tooltip").show();
          $("#tooltip").css({
              top: (e.pageY - 15) + "px",
              left: (e.pageX + 15) + "px"
            });
          $('#tooltip').text((100. * prob).toFixed(2) + '%');
        } else {
          $('#tooltip').hide();
        }
      });
    $("#gameboard").mouseout(function(e){
        $("#tooltip").hide();
      });
  });
