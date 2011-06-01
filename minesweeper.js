


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
      this.cells.push(new Cell('', mine_dist[i] ? 'mine' : null, false, false));
    }
    for (var r = 0; r < this.height; r++) {
      for (var c = 0; c < this.width; c++) {
        var cell = this.get_cell(r, c);
        if (cell.state != 'mine') {
          var count = 0;
          var neighb = this.neighbors(r, c);
          for (var i = 0; i < neighb.length; i++) {
            if (neighb[i].state == 'mine') {
              count++;
            }
          }
          cell.state = count;
        }
      }
    }
  }

  this.uncover = function (r, c) {
    var cell = this.get_cell(r, c);
    if (!cell.visible) {
      cell.visible = true;

      if (cell.state == 0) {
        var adj = this.adjacent(r, c);
        for (var i = 0; i < adj.length; i++) {
          var adj_id = adj[i][0];
          this.uncover(adj_id[0], adj_id[1]);
        }
      }
    }
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
          adj.push([[_r, _c], this.get_cell(_r, _c)]);
        }
      }
    }
    return adj;
  }

  this.neighbors = function (r, c) {
    var adj = this.adjacent(r, c);
    for (var i = 0; i < adj.length; i++) {
      adj[i] = adj[i][1];
    }
    return adj;
  }

  this.n_dist = function () {
    m = [];
    for (var i = 0; i < this.num_cells(); i++) {
      m[i] = [Math.random(), (i < this.num_mines)];
    }
    m.sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < this.num_cells(); i++) {
      m[i] = m[i][1];
    }    
    return m;
  }

  this.p_dist = function () {
    m = [];
    for (var i = 0; i < this.num_cells(); i++) {
      m[i] = (Math.random() < this.mine_prob);
    }
    return m;
  }

  this.render = function (canvas, params) {
    params = params || {};

    var ctx = canvas.getContext('2d');
    var dim = Math.min(canvas.height / this.height, canvas.width / this.width);

    for (var r = 0; r < this.height; r++) {
      for (var c = 0; c < this.width; c++) {
        this.get_cell(r, c).render(r, c, dim, ctx, params);
      }
    }
  }
}

function Cell (name, state, visible, flagged) {
  this.name = name;
  this.state = state;
  this.visible = visible;
  this.flagged = flagged;

  this.render = function (r, c, dim, ctx, params) {
    var cell_width = dim - MARGIN;
    var corner = [c * dim, r * dim];
    var center = [corner[0] + .5 * cell_width, corner[1] + .5 * cell_width];

    ctx.fillStyle = (this.visible ? VISIBLE_BG : HIDDEN_BG);
    ctx.fillRect(corner[0], corner[1], cell_width, cell_width);

    if (this.state == 'mine') {
      ctx.fillStyle = MINE_FILL;
      ctx.beginPath();
      ctx.arc(center[0], center[1], .5 * cell_width * MINE_RADIUS, 0, 2*Math.PI, false);
      if (this.flagged) {
        ctx.stroke();
      } else {
        ctx.fill();
      }
    } else if (this.state > 0 && this.visible) {
      var font_size = dim * FONT_SIZE;
      ctx.fillStyle = COUNT_FILL[Math.min(this.state - 1, COUNT_FILL.length - 1)];
      ctx.font = font_size + 'pt sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('' + this.state, center[0], center[1] + font_size * FONT_OFFSET);
    }
  }
}

HIDDEN_BG = 'rgb(200, 200, 200)';
VISIBLE_BG = 'rgb(230, 230, 230)';
MINE_FILL = 'rgba(0, 0, 0, .5)';
COUNT_FILL = ['blue', 'green', 'red', 'purple', 'brown', 'cyan', 'orange', 'black'];
MARGIN = 1;
MINE_RADIUS = .5;
FONT_SIZE = .5;
FONT_OFFSET = .1;