
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
    this.topology.for_each_index(this, function(ix, board) {
        func(ix, board.get_cell(ix), board);
      });
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

  this.for_each_index = function(board, do_) {
    this.for_range({r: 0, c: 0}, Math.max(this.width, this.height), false, function(r, c) {
        do_({r: r, c: c}, board);
      });
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

  this.for_each_index = function(board, do_) {
    for (var r = 0; r < this.height; r++) {
      for (var c = 0; c < this.row_width(r); c++) {
        do_({r: r, c: c}, board);
      }
    }
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

function CubeSurfaceTopo (width, height, depth) {
  this.width = width;
  this.height = height;
  this.depth = depth;

  //u=0, r=1, d=2, l=3
  //0=0, 90=1, 180=2, 270=3
  this.face_adj = [
    {f0: 1, dir: 2, f1: 2, orient: 0},
    {f0: 1, dir: 1, f1: 3, orient: 3},
    {f0: 2, dir: 2, f1: 4, orient: 1},
    {f0: 2, dir: 1, f1: 3, orient: 0},
    {f0: 3, dir: 2, f1: 4, orient: 0},
    {f0: 3, dir: 1, f1: 5, orient: 3},
    {f0: 4, dir: 2, f1: 6, orient: 1},
    {f0: 4, dir: 1, f1: 5, orient: 0},
    {f0: 5, dir: 2, f1: 6, orient: 0},
    {f0: 5, dir: 1, f1: 1, orient: 3},
    {f0: 6, dir: 2, f1: 2, orient: 1},
    {f0: 6, dir: 1, f1: 1, orient: 0}
  ];
                
  this.cell_name = function (pos) {
    return pos.face + '-' + pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width);
  }

  this.cell_ix = function (pos) {
    var ix = 0;
    for (var f = 1; f < pos.face; f++) {
      var ext = this.face_dim(f);
      ix += ext.w * ext.h;
    }
    return ix + pos.r * this.face_dim(pos.face).w + pos.c;
  }

  this.for_each_index = function(board, do_) {
    for (var f = 1; f <= 6; f++) {
      var ext = this.face_dim(f);
      for (var r = 0; r < ext.h; r++) {
        for (var c = 0; c < ext.w; c++) {
          do_({face: f, r: r, c: c}, board);
        }
      }
    }
  }

  this.num_cells = function () {
    return 2 * (this.width * this.height + this.width * this.depth + this.height * this.depth);
  }

  this.face_dim = function(face) {
    switch (face) {
    case 1: return {w: this.width, h: this.height};
    case 2: return {w: this.width, h: this.depth};
    case 3: return {w: this.height, h: this.depth};
    case 4: return {w: this.height, h: this.width};
    case 5: return {w: this.depth, h: this.width};
    case 6: return {w: this.depth, h: this.height};
    }
  }

  this.get = function(face, r, c, orientation) {
    var ext = this.face_dim(face);
    var _r, _c;
    switch (orientation) {
    case 0: _r = r;             _c = c; break;
    case 1: _r = ext.h - 1 - c; _c = r; break;
    case 2: _r = ext.h - 1 - r; _c = ext.w - 1 - c; break;
    case 3: _r = c;             _c = ext.w - 1 - r; break;
    }
    r = _r; c = _c;
    return {face: face, r: r < 0 ? ext.h + r : r, c: c < 0 ? ext.w + c : c};
  }

  this.adjacent = function (pos) {
    var adj = [];
    for (var r = pos.r - 1; r <= pos.r + 1; r++) {
      for (var c = pos.c - 1; c <= pos.c + 1; c++) {
        var ext = this.face_dim(pos.face);
        var r_oor = (r < 0 || r >= ext.h);
        var c_oor = (c < 0 || c >= ext.w);
        if (!r_oor || !c_oor) {
          if (r_oor || c_oor) {
            if (r < 0) {
              var dir = 0;
            } else if (r >= ext.h) {
              var dir = 2;
            } else if (c < 0) {
              var dir = 3;
            } else if (c >= ext.w) {
              var dir = 1;
            }
            var edge = null;
            for (var i = 0; i < this.face_adj.length; i++) {
              var e = this.face_adj[i];
              if ((e.f0 == pos.face && e.dir == dir) || (e.f1 == pos.face && e.dir == (dir + e.orient + 2) % 4)) {
                edge = e;
                break;
              }
            }
            var _r = (r >= ext.h ? r - ext.h : r);
            var _c = (c >= ext.w ? c - ext.w : c);
            if (edge.f0 == pos.face) {
              adj.push(this.get(edge.f1, _r, _c, edge.orient));
            } else {
              adj.push(this.get(edge.f0, _r, _c, (4 - edge.orient) % 4));
            }
          } else {
            if (r != pos.r || c != pos.c) {
              adj.push({r: r, c: c, face: pos.face});
            }
          }
        }
      }
    }
    return adj;
  }

  this.EDGE_MARGIN = .1;

  this.constants = function(canvas) {
    var x_offset = [0, this.width, this.width + this.height];
    var y_offset = [0, this.height, this.height + this.depth, this.height + this.depth + this.width]
    for (var i = 0; i < x_offset.length; i++) {
      x_offset[i] += i * this.EDGE_MARGIN;
    }
    for (var i = 0; i < y_offset.length; i++) {
      y_offset[i] += i * this.EDGE_MARGIN;
    }
    var x_max = x_offset[2] + this.depth;
    var y_max = y_offset[3] + this.height;
    var _t = x_max; x_max = y_max; y_max = _t;

    var dim = Math.min(canvas.height / y_max, canvas.width / x_max);
    var snap = function(k) {
      return (dim >= 10. ? Math.floor(k) : k);
    }

    var corner = function(pos) {
      var face_row = Math.floor(pos.face / 2);
      var face_col = Math.floor((pos.face - 1) / 2);
      var x = pos.c + x_offset[face_col];
      var y = pos.r + y_offset[face_row];
      var _t = x; x = y; y = _t;

      return {px: snap(snap(dim) * x), py: snap(snap(dim) * y)};
    }

    return {dim: snap(dim), corner: corner};
  }

  this.geom = function (pos, canvas) {
    var c = this.constants(canvas);

    var span = c.dim - MARGIN;
    var p = c.corner(pos);
    var fillfunc = function(ctx) {
      ctx.fillRect(p.px, p.py, span, span);
    }

    return {span: span, center: [p.px + .5 * span, p.py + .5 * span], fill: fillfunc};
  }

  this.cell_from_xy = function (p, canvas) {
    var _ = this.constants(canvas);
    for (var f = 6; f >= 1; f--) {
      var corner = _.corner({face: f, r: 0, c: 0});
      var r = Math.floor((p.y - corner.py) / _.dim);
      var c = Math.floor((p.x - corner.px) / _.dim);
      var ext = this.face_dim(f);
      if (r >= 0 && r < ext.h && c >= 0 && c < ext.w) {
        return {face: f, r: r, c: c};
      }
    }
    return null;
  }
}

function Cube3dTopo (width, height, depth) {
  this.w = width;
  this.h = height;
  this.d = depth;

  this.cell_name = function (pos) {
    return pad_to(pos.x + 1, this.w) + '-' + pad_to(pos.y + 1, this.h) + '-' + pad_to(pos.z + 1, this.d);
  }

  this.cell_ix = function (pos) {
    return (pos.z * this.h + pos.y) * this.w + pos.x;
  }

  this.for_each_index = function(board, do_) {
    for (var x = 0; x < this.w; x++) {
      for (var y = 0; y < this.h; y++) {
        for (var z = 0; z < this.d; z++) {
          do_({x: x, y: y, z: z}, board);
        }
      }
    }
  }

  this.num_cells = function () {
    return this.w * this.h * this.d;
  }

  this.adjacent = function (pos) {
    var adj = [];
    for (var x = Math.max(pos.x - 1, 0); x <= Math.min(pos.x + 1, this.w - 1); x++) {
      for (var y = Math.max(pos.y - 1, 0); y <= Math.min(pos.y + 1, this.h - 1); y++) {
        for (var z = Math.max(pos.z - 1, 0); z <= Math.min(pos.z + 1, this.d - 1); z++) {
          if (x != pos.x || y != pos.y || z != pos.z) {
            adj.push({x: x, y: y, z: z});
          }
        }
      }
    }
    return adj;
  }

  this.extent = function(w, h, rot, tilt) {
    var v_max = w * Math.abs(Math.sin(rot)) + h * Math.abs(Math.cos(rot));
    var h_max = (w * Math.abs(Math.cos(rot)) + h * Math.abs(Math.sin(rot))) * Math.sin(tilt);
    var h_inner = Math.min(Math.abs(w / Math.cos(rot)), Math.abs(h / Math.sin(rot))) * Math.sin(tilt);
    return {v_max: v_max, h_max: h_max, h_inner: h_inner};
  }

  this.ISO_ROT = rads(30.);
  this.ISO_TILT = rads(30.);
  this.LAYER_MARGIN = .333;

  this.calc_constants = function(canvas) {
    if (!this.dim_cached) {
      this.ext = this.extent(this.w, this.h, this.ISO_ROT, this.ISO_TILT);
      this.ext0 = this.extent(1., 1., this.ISO_ROT, this.ISO_TILT);
      this.h_margin = this.ext0.h_inner * this.LAYER_MARGIN;
      this.h_total = this.ext.h_max + (this.d - 1) * (this.ext.h_inner + this.h_margin);
    }

    if (!this.dim_cached || this.dim_cached.w != canvas.width || this.dim_cached.h != canvas.height) {
      this.scale = Math.min(canvas.width / this.h_total, canvas.height / this.ext.v_max);
      this.span = (this.scale - MARGIN) * Math.sqrt(Math.sin(this.ISO_TILT));
      
      this.dim_cached = {w: canvas.width, h: canvas.height};
    }
  }

  this.geom = function (pos, canvas) {
    this.calc_constants(canvas);
    var self = this;

    var transform = function(x, y, z) {
      x -= .5 * self.w;
      y -= .5 * self.h;
      var x_ = x * Math.cos(self.ISO_ROT) - y * Math.sin(self.ISO_ROT);
      var y_ = x * Math.sin(self.ISO_ROT) + y * Math.cos(self.ISO_ROT);
      x = x_; y = y_;
      x *= Math.sin(self.ISO_TILT);
      x += self.ext.h_max / 2. + z * (self.ext.h_inner + self.h_margin);
      y += self.ext.v_max / 2.;
      x *= self.scale; y *= self.scale;
      return {x: x, y: y};
    }
    
    var center = transform(pos.x + .5, pos.y + .5, pos.z);
    var fillfunc = function(ctx) {
      var k = .5 * MARGIN / self.scale;
      var offsets = [[k, k], [k, 1 - k], [1 - k, 1 - k], [1 - k, k], [k, k]];
     
      ctx.beginPath();
      for (var i = 0; i < offsets.length; i++) {
        var p = transform(pos.x + offsets[i][0], pos.y + offsets[i][1], pos.z);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    return {span: self.span, center: [center.x, center.y], fill: fillfunc};
  }
  
  this.cell_from_xy = function (p, canvas) {
    self = this;
    var rev_transform = function(x, y, z) {
      x /= self.scale; y /= self.scale;
      x -= self.ext.h_max / 2. + z * (self.ext.h_inner + self.h_margin);
      y -= self.ext.v_max / 2.;
      x /= Math.sin(self.ISO_TILT);
      var x_ = x * Math.cos(-self.ISO_ROT) - y * Math.sin(-self.ISO_ROT);
      var y_ = x * Math.sin(-self.ISO_ROT) + y * Math.cos(-self.ISO_ROT);
      x = x_; y = y_;
      x += .5 * self.w;
      y += .5 * self.h;
      return {x: Math.floor(x), y: Math.floor(y)};
    }

    for (var z = 0; z < this.d; z++) {
      var c = rev_transform(p.x, p.y, z);
      if (c.x >= 0 && c.x < this.w && c.y >= 0 && c.y < this.h) {
        return {x: c.x, y: c.y, z: z};
      }
    }
    return null;
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

function rads(degs) {
  return Math.PI * degs / 180.;
}