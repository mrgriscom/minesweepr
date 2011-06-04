
HIDDEN_BG = 'rgb(200, 200, 200)';
VISIBLE_BG = 'rgb(230, 230, 230)';
MINE_FILL = 'rgba(0, 0, 0, .2)';
EXPLODED = 'rgba(255, 0, 0, .8)';
COUNT_FILL = ['blue', 'green', 'red', 'purple', 'brown', 'cyan', 'orange', 'black'];
MARGIN = 1;
MINE_RADIUS = .5;
FONT_SIZE = .5;
FONT_OFFSET = .1;
FONT_SCALE_LONG = .8;

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

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.for_each_cell(function (pos, cell, board) {
        cell.render(board.topology.geom(pos, canvas), ctx, params);
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
    g.fill(ctx);

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
      var label = '' + this.state;
      var font_size = g.span * FONT_SIZE * (label.length > 1 ? FONT_SCALE_LONG : 1.);
      ctx.fillStyle = COUNT_FILL[Math.min(this.state - 1, COUNT_FILL.length - 1)];
      ctx.font = font_size + 'pt sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, g.center[0], g.center[1] + font_size * FONT_OFFSET);
    }
  }

  this.render_overlay = function (g, fill, ctx) {
    ctx.fillStyle = fill;
    g.fill(ctx);
  }
}


function GridTopo (width, height, wrap, adjfunc) {
  this.width = width;
  this.height = height;
  this.wrap = wrap;
  this.adjfunc = adjfunc;

  this.cell_name = function (pos) {
    return pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width);
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

  this.for_range = function(center, dim, wrap, do_) {
    var BIG = 1e6;
    var r_lo = Math.max(center.r - dim, wrap ? -BIG : 0);
    var r_hi = Math.min(center.r + dim, wrap ? +BIG : height - 1);
    var c_lo = Math.max(center.c - dim, wrap ? -BIG : 0);
    var c_hi = Math.min(center.c + dim, wrap ? +BIG : width - 1);
    for (var r = r_lo; r <= r_hi; r++) {
      for (var c = c_lo; c <= c_hi; c++) {
        do_((r + this.height) % this.height, (c + this.width) % this.width);
      }
    }    
  }

  this.adjacent = function (pos) {
    var adj = [];
    var adjfunc = this.adjfunc || function(topo, pos, do_) {
      topo.for_range(pos, 1, topo.wrap, do_);
    };
    adjfunc(this, pos, function(r, c) {
        if (r != pos.r || c != pos.c) {
          adj.push({r: r, c: c});
        }
      });
    return adj;
  }

  this.cell_dim = function (canvas) {
    var dim = Math.min(canvas.height / this.height, canvas.width / this.width);
    return (dim >= 10. ? Math.floor(dim) : dim);
  }

  this.geom = function (pos, canvas) {
    var dim = this.cell_dim(canvas);
    var span = dim - MARGIN;
    var corner = [pos.c * dim, pos.r * dim];
    var center = [corner[0] + .5 * span, corner[1] + .5 * span];
    var fillfunc = function(ctx) {
      ctx.fillRect(corner[0], corner[1], span, span);
    }
    return {span: span, center: center, fill: fillfunc};
  }

  this.cell_from_xy = function (p, canvas) {
    var dim = this.cell_dim(canvas);
    var r = Math.floor(p.y / dim);
    var c = Math.floor(p.x / dim);
    if (r >= 0 && r < this.height && c >= 0 && c < this.width) {
      return {r: r, c: c};
    } else {
      return null;
    }
  }
}

function HexGridTopo (width, height) {
  this.width = width;
  this.height = height;

  this.cell_name = function (pos) {
    return pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width + 1);
  }

  this.cell_ix = function (pos) {
    return pos.r * this.width + Math.floor(pos.r / 2) + pos.c;
  }

  this.rev_cell_ix = function(i) {
    var r2 = Math.floor(i / (2 * this.width + 1));
    var c2 = i % (2 * this.width + 1);
    return {r: 2 * r2 + (c2 < this.width ? 0 : 1), c: (c2 < this.width ? c2 : c2 - this.width)};
  }

  this.num_cells = function () {
    return this.width * this.height + Math.floor(this.height / 2);
  }

  this.row_width = function(r) {
    return this.width + (r % 2 == 0 ? 0 : 1);
  }

  this.adjacent = function (pos) {
    var adj = [];
    for (var r = Math.max(pos.r - 1, 0); r <= Math.min(pos.r + 1, this.height - 1); r++) {
      if (pos.r == r) {
        var c_lo = pos.c - 1;
        var c_hi = pos.c + 1;
      } else if (pos.r % 2 == 0) {
        var c_lo = pos.c;
        var c_hi = pos.c + 1;
      } else {
        var c_lo = pos.c - 1;
        var c_hi = pos.c;
      }
      for (var c = Math.max(c_lo, 0); c <= Math.min(c_hi, this.row_width(r) - 1); c++) {
        if (r != pos.r || c != pos.c) {
          adj.push({r: r, c: c});
        }
      } 
    }
    return adj;
  }

  this.cell_dim = function (canvas) {
    return Math.min(canvas.height / (.75 * this.height + .25), canvas.width / (Math.sqrt(3.) / 2. * (this.width + 1)));
  }

  this.geom = function (pos, canvas) {
    var dim = this.cell_dim(canvas);
    var span = dim - MARGIN;
    var center = [Math.sqrt(3.) / 2. * dim * (pos.c + (pos.r % 2 == 0 ? 1 : .5)), dim * (.75 * pos.r + .5)];
    var fillfunc = function(ctx) {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var angle = 2*Math.PI / 6. * i;
        ctx.lineTo(center[0] + .5 * span * Math.sin(angle), center[1] + .5 * span * Math.cos(angle));
      }
      ctx.closePath();
      ctx.fill();
    }
    return {span: span * .8, center: center, fill: fillfunc};
  }

  this.cell_from_xy = function (p, canvas) {
    var dim = this.cell_dim(canvas);
    var dx2 = .25 * Math.sqrt(3.) * dim;
    var dy3 = .25 * dim;
    var c2 = Math.floor(p.x / dx2);
    var r3 = Math.floor(p.y / dy3);
    if (r3 % 3 == 0) {
      var r_ = Math.floor(r3 / 3);
      var mode = (r_ + c2) % 2;
      var kx = (p.x - c2 * dx2) / dx2;
      var ky = (p.y - r3 * dy3) / dy3;
      r3 += ((mode == 0 ? ky > kx : ky > 1. - kx) ? 1 : -1);
    }
    var r = Math.floor(r3 / 3);
    var c = Math.floor((c2 + (r % 2 == 0 ? -1 : 0)) / 2);
    if (r >= 0 && r < this.height && c >= 0 && c < this.row_width(r)) {
      return {r: r, c: c};
    } else {
      return null;
    }
  }
}


function pad(i, n) {
  var s = '' + i;
  while (s.length < n) {
    s = '0' + s;
  }
  return s;
}

function pad_to (i, max) {
  return pad(i, ('' + max).length);
};

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

