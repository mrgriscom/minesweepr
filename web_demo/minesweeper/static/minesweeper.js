
function GridTopo (width, height) {
  this.width = width;
  this.height = height;

  this.cell_name = function (pos) {
    var pad_to = function (i, max) { return pad(i, ('' + max).length); };
    return pad_to(pos.r, this.height) + '-' + pad_to(pos.c, this.width);
  }

  this.cell_ix = function (pos) {
    return pos.r * this.width + pos.c;
  }

  this.rev_cell_ix = function(i) {
    return {r: Math.floor(i / this.width), c: i % this.width};
  }

  this.num_cells = function () {
    return this.width * this.height;
  }

  this.adjacent = function (pos) {
    var adj = [];
    for (var r = Math.max(pos.r - 1, 0); r <= Math.min(pos.r + 1, height - 1); r++) {
      for (var c = Math.max(pos.c - 1, 0); c <= Math.min(pos.c + 1, width - 1); c++) {
        if (r != pos.r || c != pos.c) {
          adj.push({r: r, c: c});
        }
      }
    }
    return adj;
  }

  this.cell_dim = function (canvas) {
    var dim = Math.min(canvas.height / this.height, canvas.width / this.width);
    return (dim >= 10. ? Math.floor(dim) : dim);
  }

  this.geom = function (pos, canvas) {
    var dim = this.cell_dim(canvas);
    var cell_width = dim - MARGIN;
    var corner = [pos.c * dim, pos.r * dim];
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
}


function Board (topology) {
  this.topology = topology;
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
    this.for_each_cell(function (pos, cell, board) {
        cell.name = board.topology.cell_name(pos);
        if (cell.state != 'mine') {
          var count = 0;
          board.for_each_neighbor(pos, function (pos, neighb, board) {
              if (neighb.state == 'mine') {
                count++;
              }
            });
          cell.state = count;
        }
      });
  }

  this.uncover = function (pos) {
    var cell = this.get_cell(pos);
    if (!cell.visible) {
      cell.visible = true;

      if (cell.state == 'mine') {
        return false;
      } else {
        if (cell.state == 0) {
          this.for_each_neighbor(pos, function (pos, neighb, board) {
              board.uncover(pos);
            });
        }
        return true;
      }
    }
  }

  this.flag = function (pos) {
    this.get_cell(pos).flagged = true;
  }

  this.get_cell = function (pos) {
    return this.cells[this.topology.cell_ix(pos)];
  }

  this.num_cells = function () {
    return this.topology.num_cells();
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

  this.safe_cell = function () {
    var c = [];
    this.for_each_cell(function (pos, cell, board) {
        if (cell.state != 'mine') {
          c.push(pos);
        }
      });
    return choose_rand(c);
  }

  this.for_each_cell = function (func) {
    for (var i = 0; i < this.cells.length; i++) {
      func(this.topology.rev_cell_ix(i), this.cells[i], this);
    }
  }

  this.for_each_neighbor = function (pos, func) {
    var adj = this.topology.adjacent(pos);
    for (var i = 0; i < adj.length; i++) {
      var neighb_pos = adj[i];
      func(neighb_pos, this.get_cell(neighb_pos), this);
    }
  }

  this.for_each_name = function (names, func) {
    this.for_each_cell(function (pos, cell, board) {
        if (names.indexOf(cell.name) != -1) {
          func(pos, cell, board);
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

    this.for_each_cell(function (pos, cell, board) {
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
            board.for_each_neighbor(pos, function (pos, neighbor, board) {
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
            board.for_each_neighbor(pos, function (pos, neighbor, board) {
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

  this.render = function (canvas, params) {
    params = params || {};

    this.for_each_cell(function (pos, cell, board) {
        cell.render(board.topology.geom(pos, canvas), canvas.getContext('2d'), params);
      });
  }

  this.render_overlay = function(pos, fill, canvas) {
    this.get_cell(pos).render_overlay(this.topology.geom(pos, canvas), fill, canvas.getContext('2d'));
  }

  this.cell_from_xy = function(p, canvas) {
    return this.topology.cell_from_xy(p, canvas);
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

function choose_rand(data) {
  return data[Math.floor(Math.random() * data.length)];
}

