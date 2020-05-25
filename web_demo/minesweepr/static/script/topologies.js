/* Topo classes implement various board topologies; they must implement the following interface:

  [constructor] - sets board dimensions + other optional parameters
  type - radio button id for this topology type (set externally)
  axes - list of axes that make up this topology's index format, ordered most-significant to least
  dims() - return a dict of topo's dimensions (only including those which are relevant)  
  num_cells() - return number of cells on board
  for_each_index(func(pos)) - iterate through the indexes of all cells on the board (index format determined
    by topology) and call func with each index. iteration order MUST match 'axes'
  cell_ix(pos) - convert index to the position of that cell in a flat array
  cell_name(pos) - convert index to a human readable name
  adjacent(pos) - return a list of all the cells adjacent to this index; returned cells need not be unique
  increment_ix(ix, axis, dir) - move from index 'ix' to adjacent index along an axis (x/y/z) forward/up (dir:true)
    or back/down (dir:false). MODIFIES THE INDEX IN-PLACE
  for_select_range(pos0, pos1, func(pos)) - iterate over all the indexes between pos0 and pos1, defined according
    to some screen-selection modality, and call func for each index. no ordering guarantees between pos0/pos1
  cell_from_xy(p{x,y}, canvas) - return the cell index at canvas coordinates (x,y), null if out of bounds
  geom(pos, canvas) - return a complex object encapsulating the cell's rendering geometry:
  {
    center: x/y coordinates of the center of the cell,
    span: width of square cell, or analagous 'diameter' of other-shaped cells
    path(context, no_margin): a function that, given canvas context, draws the path of the cell's perimeter
      if 'no_margin', draw path that doesn't include margin between cells (used for clearing) and return
      true; if a separate no-margin path is not needed for clearing (such as when the perimeter snaps to pixel
      boundaries), return false (though the path must still be drawn as the return value is merely a recommendation)
  }
*/

function GridTopo (width, height, wrap, adjfunc) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    this.adjfunc = adjfunc;
    this.dims = function() {
        return {width: this.width, height: this.height};
    }

    this.cell_name = function (pos) {
        return pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width);
    }

    this.cell_ix = function (pos) {
        return pos.r * this.width + pos.c;
    }

    this.for_each_index = function(do_) {
        this.for_range(0, this.width - 1, 0, this.height - 1, false, do_);
    }

    this.num_cells = function () {
        return this.width * this.height;
    }

    this.for_radius = function(center, dim, do_) {
        this.for_range(center.c - dim, center.c + dim, center.r - dim, center.r + dim, this.wrap, do_);
    }

    this.for_select_range = function(pos0, pos1, do_) {
        this.for_range(
            Math.min(pos0.c, pos1.c),
            Math.max(pos0.c, pos1.c),
            Math.min(pos0.r, pos1.r),
            Math.max(pos0.r, pos1.r),
            false, do_);
    }
    
    this.axes = ['r', 'c'];
    this.for_range = function(x0, x1, y0, y1, wrap, do_) {
        if (!wrap) {
            x0 = Math.max(x0, 0);
            y0 = Math.max(y0, 0);
            x1 = Math.min(x1, this.width - 1);
            y1 = Math.min(y1, this.height - 1);
        }
        for (var r = y0; r <= y1; r++) {
            for (var c = x0; c <= x1; c++) {
                do_({r: mod(r, this.height), c: mod(c, this.width)});
            }
        }
    }
    
    this.adjacent = function (pos) {
        var adj = [];
        var adjfunc = this.adjfunc || function(topo, pos, do_) {
            topo.for_radius(pos, 1, do_);
        };
        adjfunc(this, pos, function(ix) {
            if (ix.r != pos.r || ix.c != pos.c) {
                adj.push(ix);
            }
        });
        return adj;
    }

    this.increment_ix = function(ix, axis, dir) {
        var dim = {x: 'c', y: 'r'}[axis];
        var sz = {x: this.width, y: this.height}[axis];
        ix[dim] = mod(ix[dim] + (dir ? 1 : -1), sz);
    }

    this.pixel_snap = function(dim) {
        return dim >= 10.;
    }
    
    this.cell_dim = function (canvas) {
        var dim = Math.min(canvas.height / this.height, canvas.width / this.width);
        return (this.pixel_snap(dim) ? Math.floor(dim) : dim);
    }

    this.geom = function (pos, canvas) {
        var dim = this.cell_dim(canvas);
        var snap = this.pixel_snap(dim);
        var span = dim - MARGIN;
        var corner = [pos.c * dim, pos.r * dim];
        var center = [corner[0] + .5 * span, corner[1] + .5 * span];
        var path = function(ctx, no_margin) {
            var buf = (no_margin && !snap ? .5*MARGIN : 0);
            ctx.rect(corner[0] - buf, corner[1] - buf, span + buf, span + buf);
            return (buf > 0);
        }
        return {span: span, center: center, path: path};
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
    this.dims = function() {
        return {width: this.width, height: this.height};
    }

    this.cell_name = function (pos) {
        return pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width + 1);
    }

    this.cell_ix = function (pos) {
        return pos.r * this.width + Math.floor(pos.r / 2) + pos.c;
    }

    this.axes = ['r', 'c'];
    this.for_each_index = function(do_) {
        for (var r = 0; r < this.height; r++) {
            for (var c = 0; c < this.row_width(r); c++) {
                do_({r: r, c: c});
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

    this.increment_ix = function(ix, axis, dir) {
        if (axis == 'x') {
            ix.c = mod(ix.c + (dir ? 1 : -1), this.row_width(ix.r));
        } else {
            var new_r = mod(ix.r + (dir ? 1 : -1), this.height);
            if ((ix.r % 2) == (new_r % 2)) {
                // vertical wraparound where tiles don't mesh
                ix.c = ix.c + ((axis == 'y') ^ dir ? -1 : 1);
            } else {
                ix.c = ix.c + ((axis == 'y') ^ dir ? 0 : 1) - (ix.r % 2);
            }
            ix.r = new_r;
            // horizontal wraparound -- don't use mod so as to ensure we wrap to edge
            if (ix.c >= this.row_width(ix.r)) {
                ix.c = 0;
            } else if (ix.c < 0) {
                ix.c = this.row_width(ix.r) - 1;
            }
        }
    }

    this.for_select_range = function(pos0, pos1, do_) {
        var x0 = Math.min(pos0.c, pos1.c);
        var x1 = Math.max(pos0.c, pos1.c);
        var y0 = Math.min(pos0.r, pos1.r);
        var y1 = Math.max(pos0.r, pos1.r);
        for (var r = y0; r <= y1; r++) {
            for (var c = x0; c <= Math.min(x1, this.row_width(r) - 1); c++) {
                do_({r: r, c: c});
            }
        }
    }
    
    this.cell_dim = function (canvas) {
        return Math.min(canvas.height / (.75 * this.height + .25), canvas.width / (Math.sqrt(3.) / 2. * (this.width + 1)));
    }

    this.geom = function (pos, canvas) {
        var dim = this.cell_dim(canvas);
        var span = dim - MARGIN;
        var center = [Math.sqrt(3.) / 2. * dim * (pos.c + (pos.r % 2 == 0 ? 1 : .5)), dim * (.75 * pos.r + .5)];
        var path = function(ctx, no_margin) {
            var r = .5 * (no_margin ? dim : span);
            for (var i = 0; i < 6; i++) {
                var angle = 2*Math.PI / 6. * i;
                ctx.lineTo(center[0] + r * Math.sin(angle), center[1] + r * Math.cos(angle));
            }
            ctx.closePath();
            return no_margin;
        }        
        return {span: span * .8, center: center, path: path};
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
    this.dims = function() {
        return {width: this.width, height: this.height, depth: this.depth};
    }
    
    //direction: u=0, r=1, d=2, l=3
    //orientation: 0=0, 90=1, 180=2, 270=3
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

    this.axes = ['face', 'r', 'c'];
    this.for_each_index = function(do_) {
        for (var f = 1; f <= 6; f++) {
            var ext = this.face_dim(f);
            for (var r = 0; r < ext.h; r++) {
                for (var c = 0; c < ext.w; c++) {
                    do_({face: f, r: r, c: c});
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
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var _adj = this.adjacent_for(pos, dr, dc);
                if (_adj != null) {
                    adj.push(_adj);
                }
            }
        }
        return adj;
    }

    this.adjacent_for = function(pos, dr, dc) {
        var r = pos.r + dr;
        var c = pos.c + dc;
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
                    return this.get(edge.f1, _r, _c, edge.orient);
                } else {
                    return this.get(edge.f0, _r, _c, (4 - edge.orient) % 4);
                }
            } else {
                if (r != pos.r || c != pos.c) {
                    return {r: r, c: c, face: pos.face};
                }
            }
        }
        return null;
    }
    
    this.increment_ix = function(ix, axis, dir) {
        var incr = (dir ? 1 : -1);
        // note: axis reversal -- x maps to row and y to col
        var adj = this.adjacent_for(ix, axis == 'x' ? incr : 0, axis == 'y' ? incr : 0);
        // need to update in place, not return
        ix.face = adj.face;
        ix.r = adj.r;
        ix.c = adj.c;
    }

    this.for_select_range = function(pos0, pos1, do_) {
        var c = this.constants();
        var xy0 = c.corner(pos0);
        var xy1 = c.corner(pos1);
        var x0 = Math.min(xy0.px, xy1.px);
        var y0 = Math.min(xy0.py, xy1.py);
        var x1 = Math.max(xy0.px, xy1.px);
        var y1 = Math.max(xy0.py, xy1.py);
        this.for_each_index(function(ix) {
            var xy = c.corner(ix);
            if (xy.px >= x0 && xy.px <= x1 && xy.py >= y0 && xy.py <= y1) {
                do_(ix);
            }
        });
    }

    this.EDGE_MARGIN = .1;

    this.pixel_snap = function(dim) {
        return dim >= 10.;
    }
    
    this.constants = function(canvas) {
        var margin = (canvas != null ? this.EDGE_MARGIN : 0);
        
        var x_offset = [0, this.width, this.width + this.height];
        var y_offset = [0, this.height, this.height + this.depth, this.height + this.depth + this.width]
        for (var i = 0; i < x_offset.length; i++) {
            x_offset[i] += i * margin;
        }
        for (var i = 0; i < y_offset.length; i++) {
            y_offset[i] += i * margin;
        }
        var x_max = x_offset[2] + this.depth;
        var y_max = y_offset[3] + this.height;
        var _t = x_max; x_max = y_max; y_max = _t;

        if (canvas != null) {
            var dim = Math.min(canvas.height / y_max, canvas.width / x_max);
        } else {
            var dim = 1;
        }
        var _snap = this.pixel_snap(dim);
        var snap = function(k) {
            return (_snap ? Math.floor(k) : k);
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
        var snap = this.pixel_snap(c.dim);
        var path = function(ctx, no_margin) {
            var buf = (no_margin && !snap ? .5*MARGIN : 0);
            ctx.rect(p.px - buf, p.py - buf, span + buf, span + buf);
            return (buf > 0);
        }

        return {span: span, center: [p.px + .5 * span, p.py + .5 * span], path: path};
    }

    this.cell_from_xy = function (p, canvas) {
        var _ = this.constants(canvas);
        for (var f = 6; f >= 1; f--) {
            var corner = _.corner({face: f, r: 0, c: 0});
            var c = Math.floor((p.y - corner.py) / _.dim);
            var r = Math.floor((p.x - corner.px) / _.dim);
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
    this.dims = function() {
        return {width: this.w, height: this.h, depth: this.d};
    }

    this.cell_name = function (pos) {
        return pad_to(pos.x + 1, this.w) + '-' + pad_to(pos.y + 1, this.h) + '-' + pad_to(pos.z + 1, this.d);
    }

    this.cell_ix = function (pos) {
        return (pos.z * this.h + pos.y) * this.w + pos.x;
    }

    this.for_each_index = function(do_) {
        this.for_range(0, this.w - 1, 0, this.h - 1, 0, this.d - 1, do_);
    }

    this.for_radius = function(center, dim, do_) {
        this.for_range(center.x - dim, center.x + dim,
                       center.y - dim, center.y + dim,
                       center.z - dim, center.z + dim,
                       do_);
    }

    this.for_select_range = function(pos0, pos1, do_) {
        this.for_range(
            Math.min(pos0.x, pos1.x),
            Math.max(pos0.x, pos1.x),
            Math.min(pos0.y, pos1.y),
            Math.max(pos0.y, pos1.y),
            Math.min(pos0.z, pos1.z),
            Math.max(pos0.z, pos1.z),
            do_);
    }
    
    this.axes = ['z', 'y', 'x'];
    this.for_range = function(x0, x1, y0, y1, z0, z1, do_) {
        x0 = Math.max(x0, 0);
        y0 = Math.max(y0, 0);
        z0 = Math.max(z0, 0);
        x1 = Math.min(x1, this.w - 1);
        y1 = Math.min(y1, this.h - 1);
        z1 = Math.min(z1, this.d - 1);
        for (var z = z0; z <= z1; z++) {
            for (var y = y0; y <= y1; y++) {
                for (var x = x0; x <= x1; x++) {
                    do_({x: x, y: y, z: z});
                }
            }
        }
    }
    
    this.num_cells = function () {
        return this.w * this.h * this.d;
    }

    this.adjacent = function (pos) {
        var adj = [];
        this.for_radius(pos, 1, function(ix) {
            if (ix.x != pos.x || ix.y != pos.y || ix.z != pos.z) {
                adj.push(ix);
            }
        });
        return adj;
    }

    this.increment_ix = function(ix, axis, dir) {
        var sz = {x: this.w, y: this.h, z: this.d}[axis];
        ix[axis] = mod(ix[axis] + (dir ? 1 : -1), sz);
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
        var path = function(ctx, no_margin) {
            var k = .5 * (no_margin ? 0 : MARGIN) / self.scale;
            var offsets = [[k, k], [k, 1 - k], [1 - k, 1 - k], [1 - k, k], [k, k]];
            
            for (var i = 0; i < offsets.length; i++) {
                var p = transform(pos.x + offsets[i][0], pos.y + offsets[i][1], pos.z);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            return no_margin;
        }
        return {span: self.span, center: [center.x, center.y], path: path};
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

        // could make a binary search
        for (var z = 0; z < this.d; z++) {
            var c = rev_transform(p.x, p.y, z);
            if (c.x >= 0 && c.x < this.w && c.y >= 0 && c.y < this.h) {
                return {x: c.x, y: c.y, z: z};
            }
        }
        return null;
    }
}

function GeodesicTopo(dim, skew, hex) {
    this.N = dim;
    this.c = skew % dim;
    this.mode = (hex ? 'hex' : 'tri');

    // note: init() called at end
    this.init = function() {
        this.faces = this.tessellate(this.N, this.c, this.mode);
        this.constants = this._constants();
 
        var that = this;
        this.faces = _.sortBy(this.faces, function(f) {
            return that._pos_to_id(that.face_to_pos(f));
        });
        this.face_id_to_ix = {};
        $.each(this.faces, function(i, f) {
            var id = that._pos_to_id(that.face_to_pos(f));
            that.face_id_to_ix[id] = i;
        });
    }

    this._constants = function() {
        var c = {
            skew_tx: this.skew_tx(this.N, this.c),
            tri_tx: {U: vec(1, 0), V: vec(-.5, .5*Math.sqrt(3))},
            // radius of pentagon with edge length 1
            pentagon_radius: .5 / Math.sin(Math.PI / 5),
            pentagon_inner_radius: .5 * Math.tan(Math.PI*(.5 - 1/5)),
        };
        c.inv_skew_tx = invert_transform(c.skew_tx);
        c.inv_tri_tx = invert_transform(c.tri_tx);
        // spacing between two vertices (triangle corners or hexagon centers)
        var basis = transform(transform(vec(1, 0), c.skew_tx), c.tri_tx);
        c.span = Vlen(basis);
        // radius of center of tile to the boundary vertices
        // same for both hex and tri, since hex center are tri vertices and vice versa
        c.radius = c.span / Math.sqrt(3);
        var theta0 = Math.atan2(basis.y, basis.x);
        c.geom_angle = function(nsides, k) {
            return 2*Math.PI / nsides * k + theta0;
        }
        
        c.bounds = get_bounds(this.faces, function(f) {
            return transform(transform(f.center, c.skew_tx), c.tri_tx);
        });
        c.bounds.xmin -= c.radius;
        c.bounds.xmax += c.radius;
        c.bounds.ymin -= c.radius;
        c.bounds.ymax += c.radius;
        c.ix_bounds = get_bounds(this.faces, function(f) { return f.p; });
        c.ix_width = c.ix_bounds.xmax - c.ix_bounds.xmin + 1;
        c.ix_height = c.ix_bounds.ymax - c.ix_bounds.ymin + 1;
        
        $.each(this.faces, function(i, f) {
            if (f.pentagon_anchor_dir != null) {
                // TODO if N=1, render a custom dodechahedral net
            
                var p = transform(transform(f.center, c.skew_tx), c.tri_tx);
                var dir = f.pentagon_anchor_dir;
                var links_at_corner = (Math.abs((dir % 1.) - .5) < EPSILON);
                if (links_at_corner) {
                    var displacement = 1 - c.pentagon_radius;
                    // rotate 180
                    dir += 3
                    displacement = -displacement;
                } else {
                    var displacement = .5*Math.sqrt(3.) - c.pentagon_inner_radius;
                }
                var displ = vecPolar(displacement * c.radius, c.geom_angle(6, dir));
                p = Vadd(p, displ);
                f.proj_center = p;

                // dir is in units of hexagon-sides; must convert to pentagon-sides
                f.rot0 = dir * 5/6;
            }
        });
        
        return c;
    }
    
    this.dims = function() {
        return {width: this.N, skew: this.c};
    }

    this.cell_name = function (pos) {
        var c = this.constants;
        return pad_to(pos.y - c.ix_bounds.ymin + 1, c.ix_height) + '-' +
            pad_to(pos.x - c.ix_bounds.xmin + 1, c.ix_width) +
            (pos.n != null ? ['A', 'B'][pos.n] : '') + ' (f' + (pos.face + 1) + ')';
    }

    this.face_to_pos = function(f) {
        var pos = {face: f.face, x: f.p.x, y: f.p.y};
        if (f.topheavy != null) {
            pos.n = (f.topheavy ? 1 : 0);
        }
        return pos;
    }
    
    this._pos_to_id = function(pos) {
        // negate y for top-down ordering
        var id = -pos.y * this.constants.ix_width + pos.x;
        if (pos.n != null) {
            // invert n for proper left-to-right
            id = 2*id + (1 - pos.n);
        }
        return id;
    }

    this.cell_ix = function (pos) {
        // note: 'face' is ignored
        return this.face_id_to_ix[this._pos_to_id(pos)];
    }

    this.axes = ['y', 'x'];
    this.for_each_index = function(do_) {
        var that = this;
        $.each(this.faces, function(_, f) {
            do_(that.face_to_pos(f));
        });
    }

    this.num_cells = function () {
        return this.faces.length;
    }

    this.adjacent = function (pos) {
        // FIXME
        return [];
    }

    this.increment_ix = function(ix, axis, dir) {
        // FIXME
        // hex use x,y,z
        // tri use up/down, left/right, be smart with current theta0
        // follow adj in chosen dir
    }

    this.for_select_range = function(pos0, pos1, do_) {
        do_(pos0);
        // FIXME simple xy rect like for cube2d
    }

    // not part of interface
    this.cell_dim = function (canvas) {
        //return Math.min(canvas.height / (.75 * this.height + .25), canvas.width / (Math.sqrt(3.) / 2. * (this.width + 1)));
    }

    this.canvas_placement = function(canvas) {
        var c = this.constants;
        var scale = Math.min(canvas.width / (c.bounds.xmax - c.bounds.xmin), canvas.height / (c.bounds.ymax - c.bounds.ymin));
        var pixel_tx = function(p) {
            return {x: (p.x - c.bounds.xmin) * scale, y: (c.bounds.ymax - p.y) * scale};
        }
        var inv_pixel_tx = function(p) {
            return {x: p.x / scale + c.bounds.xmin, y: c.bounds.ymax - p.y / scale};
        }
        return {
            scale: scale,
            pixel_tx: pixel_tx,
            inv_pixel_tx: inv_pixel_tx,
        };
    }
    
    this.geom = function (pos, canvas) {
        var c = this.constants;
        var f = this.faces[this.cell_ix(pos)];
        var placement = this.canvas_placement(canvas);
        
        if (f.pentagon_anchor_dir == null) {
            var center = transform(transform(f.center, c.skew_tx), c.tri_tx);
            var nsides = {hex: 6, tri: 3}[this.mode];
            var rot0 = {hex: 0, tri: (f.topheavy ? 0 : .5) - .25}[this.mode];
            var radius = c.radius;
        } else {
            var center = f.proj_center;
            var nsides = 5;
            var radius = c.radius * c.pentagon_radius;
            var rot0 = f.rot0;
        }

        var span = c.span * placement.scale;
        span *= {hex: .8, tri: .65}[this.mode];
        var center_px = placement.pixel_tx(center);
        return {
            span: span,
            center: [center_px.x, center_px.y],
            path: function(ctx, no_margin) {
                var buf = .5 * (no_margin ? 0 : 1) / placement.scale;
                var r = radius - buf / Math.cos(Math.PI / nsides); // angle from edge center to vertex
                for (var i = 0; i < nsides; i++) {
                    var p = Vadd(center, vecPolar(r, c.geom_angle(nsides, i + rot0 + .5)));
                    var px = placement.pixel_tx(p);
                    ctx.lineTo(px.x, px.y);
                }
                ctx.closePath();
                return no_margin;
            },
        };
    }

    this.cell_from_xy = function (p, canvas) {
        var c = this.constants;
        var placement = this.canvas_placement(canvas);
        var canvcoord = placement.inv_pixel_tx(p);
        var coord = transform(transform(canvcoord, c.inv_tri_tx), c.inv_skew_tx);

        var pi = vec(Math.floor(coord.x), Math.floor(coord.y));
        var pf = Vdiff(coord, pi);
        
        if (this.mode == 'tri') {
            var pos = {x: pi.x, y: pi.y, n: (pf.y > pf.x ? 1 : 0)};
        } else if (this.mode == 'hex') {
            // return whether p is above the line between p0 and p1
            var cleave = function(p, p0, p1) {
                return p.y > (p.x - p0.x) / (p1.x - p0.x) * (p1.y - p0.y) + p0.y;
            }

            var triA = vec(1/3., 2/3.);
            var triB = vec(2/3., 1/3.);
            if (cleave(pf, triA, triB)) {
                if (cleave(pf, triA, Vadd(triA, triA))) {
                    var incr = vec(0, 1);
                } else if (cleave(pf, triB, Vadd(triB, triB))) {
                    var incr = vec(1, 1);
                } else {
                    var incr = vec(1, 0);
                }
            } else {
                if (cleave(pf, triA, Vdiff(triA, triB))) {
                    var incr = vec(0, 1);
                } else if (cleave(pf, triB, Vdiff(triB, triA))) {
                    var incr = vec(0, 0);
                } else {
                    var incr = vec(1, 0);
                }
            }
            pos = Vadd(pi, incr);
            var face = this.faces[this.cell_ix(pos)];
            if (face != null && face.pentagon_anchor_dir != null) {
                var delta = Vdiff(canvcoord, face.proj_center);
                var dist = Vlen(delta);
                var theta = Math.atan2(delta.y, delta.x);
                theta -= c.geom_angle(5, face.rot0);
                if (!inside_regular_poly(5, dist, theta, c.radius * c.pentagon_radius)) {
                    pos = null;
                }
            }
        }

        if (pos != null) {
            if (pos.x < c.ix_bounds.xmin || pos.x > c.ix_bounds.xmax) {
                // prevent out-of-bounds tiles colliding with legit ids due to wraparound
                pos = null;
            } else if (this.cell_ix(pos) == null) {
                // not a valid tile
                pos = null;
            }
        }
        return pos;
    }

    this.skew_tx = function(N, c) {
        var b = N - c;
        return invert_transform({U: vec(b, -c), V: vec(c, b + c)});
    }

    this.footprint_bounds = function(tx) {
        var corners = [];
        var inv_tx = invert_transform(tx);
        $.each([0, 3], function(_, y) {
            $.each([0, 5], function(_, x) {
                corners.push(transform(vec(x, y), inv_tx));
            });
        });
        var bounds = get_bounds(corners);
        //console.log((bounds.xmax - bounds.xmin) * (bounds.ymax - bounds.ymin) / (3*N * 5*N));
        return bounds;
    }

    this.tessellate = function(N, c, type) {
        var tx = this.skew_tx(N, c);
        var bounds = this.footprint_bounds(tx);
        
        var n = {hex: 1, tri: 2}[type];
        var faces = [];
        for (var y = bounds.ymin; y < bounds.ymax; y++) {
            for (var x = bounds.xmin; x < bounds.xmax; x++) {
                for (var i = 0 ; i < n; i++) {
                    var face = this.face_for_tile(vec(x, y), i, type, tx);
                    if (face != null) {
                        faces.push(face);
                    }
                }
            }
        }
        if (type == 'hex') {
            this.pentagon_caps(tx, faces);
        }
        return faces;
    }

    this.to_face_tri = function(p) {
        var ix = Math.floor(p.x + EPSILON);
        var iy = Math.floor(p.y + EPSILON);
        var fx = p.x - ix;
        var fy = p.y - iy;
        
        // note: the inequalities here determine which face 'wins' the edges
        // there must be tie-breakers because an icosahedron's edges are not an even multiple of its faces
        var vertex = (fx < EPSILON && fy < EPSILON);
        var topheavy = fy > fx + EPSILON;
        return {x: ix, y: iy, topheavy: topheavy, vertex: vertex};
    }

    // map a face tri to a sequential face number; discard faces outside the icosahedron footprint
    this.face_tri_to_num = function(ft) {
        if (ft.x >= 0 && ft.x < 5) {
            if (ft.y == 2 && !ft.topheavy) {
                return ft.x;
            } else if (ft.y == 1) {
                return 5 + 2*ft.x + (ft.topheavy ? 0 : 1);
            } else if (ft.y == 0 && ft.topheavy) {
                return 15 + ft.x;
            }
        }
        return null;
    }

    this.face_for_tile = function(p, i, type, sktx) {
        var topheavy = (type == 'tri' ? i == 1 : null);
        var center_offset = {
            hex: vec(0, 0),
            tri: {false: vec(2/3., 1/3.), true: vec(1/3., 2/3.)}[topheavy]
        }[type];
        var center = Vadd(p, center_offset);
        var face = this.to_face_tri(transform(center, sktx));
        
        var tile = {p: p, center: center};
        
        if (type == 'hex') {
            if (face.vertex) {
                // pentagon -- handled later
                return null;
            }
        } else if (type == 'tri') {
            tile.topheavy = topheavy;
            // face.vertex always false -- tri centers can't land on icosahedron vertices
            
            // triangle tiles can't be assigned to faces just based on their centers -- results in
            // an unpleasant sawtooth pattern. the reference point for determining the correct face
            // is the center of the conjoined 'diamond' with the neighboring triangle. but the
            // orientation of the diamond (hence, which neighbor) varies by which edge of the face
            // it's straddling. logic below sorts this all out.
            // note this logic depends on skew transform param c being normalized to range [0, N)
            
            var edge_conditions = {
                'vert': {
                    relref: {false: vec(.5, 0), true: vec(.5, 1.)}[topheavy],
                    dx: true,
                },
                'horiz': {
                    relref: {false: vec(.5, .5), true: vec(.5, .5)}[topheavy],
                    dy: true,
                },
                'sloped': {
                    relref: {false: vec(1., .5), true: vec(0, .5)}[topheavy],
                },
            };
            var that = this;
            $.each(edge_conditions, function(k, v) {
                // get adjacent face using the designated reference point
                var p_ref = Vadd(p, v.relref);
                var face_ref = that.to_face_tri(transform(p_ref, sktx));
                // check the adjacent face (if different from naive face), matches the expected
                // difference for the designated face edge
                if (face_ref.topheavy != face.topheavy &&
                    !!v.dx == (face_ref.x != face.x) &&
                    !!v.dy == (face_ref.y != face.y)) {
                    face = face_ref;
                    return false; // break
                }
            });
        }

        var face = this.face_tri_to_num(face);
        if (face == null) {
            return null;
        }
        tile.face = face;
        return tile;
    }
    
    this.pentagon_caps = function(tx, faces) {
        // determine how the pentagon links to the rest of the tiles by checking
        // the adjacent slot in all six directions; compute the number of adjacent tiles
        // and their average direction
        var that = this;
        var link_to_adj = function(p) {
            var dirs_to_adj = [];
            for (var dir = 0; dir < 6; dir++) {
                var delta = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]][dir];
                var p_adj = Vadd(p, vec(delta[0], delta[1]));
                var face = that.face_tri_to_num(that.to_face_tri(transform(p_adj, tx)));
                if (face != null) {
                    // need to ensure all dirs are contiguous to compute average correctly
                    // (i.e., 0 and 6 are and should average to -0.5 / 5.5)
                    var normalized_dir = dir;
                    if (dirs_to_adj.length > 0 && dir - 1 != dirs_to_adj.slice(-1)[0]) {
                        normalized_dir -= 6;
                    }
                    dirs_to_adj.push(normalized_dir);
                }
            }
            var sum = 0;
            for (var i = 0; i < dirs_to_adj.length; i++) {
                sum += dirs_to_adj[i];
            }
            return {avg_dir: mod(sum / dirs_to_adj.length, 6), count: dirs_to_adj.length};
        };
        
        var inv_tx = invert_transform(tx);
        for (var v = 0; v < 12; v++) {
            var footprint_vertex;
            if (v < 10) {
                footprint_vertex = vec(v % 5, 2 - Math.floor(v / 5));
            } else if (v == 10) {
                footprint_vertex = vec(1, 3);
            } else if (v == 11) {
                footprint_vertex = vec(5 - 1, 0);
            }
            var p = transform(footprint_vertex, inv_tx);
            
            var link = link_to_adj(p);
            if (footprint_vertex.x == 0) {
                // these can link to either side due to wraparound; determine which side
                // is more connected
                var p_alt = transform(vec(5, footprint_vertex.y), inv_tx);
                var alt_link = link_to_adj(p_alt);
                if (alt_link.count > link.count) {
                    link = alt_link;
                    p = p_alt;
                }
            }
            faces.push({face: -1, p: p, center: p, pentagon_anchor_dir: link.avg_dir});
        }   
    }

    this.init();
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

function rads(degs) {
    return Math.PI * degs / 180.;
}

function mod(a, b) {
    return ((a % b) + b) % b;
}

function vec(x, y) {
    return {x: x, y: y};
}

function vecPolar(r, theta) {
    return vec(r * Math.cos(theta), r * Math.sin(theta));
}

function Vadd(a, b) {
    return vec(a.x + b.x, a.y + b.y);
}

function Vdiff(a, b) {
    return vec(a.x - b.x, a.y - b.y);
}

function Vlen(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

function transform(p, basis) {
    var U = basis.U;
    var V = basis.V;
    return vec(p.x * U.x + p.y * V.x,
               p.x * U.y + p.y * V.y);
}

function invert_transform(basis) {
    var U = basis.U;
    var V = basis.V;
    var det = 1. / (U.x * V.y - U.y * V.x);
    return {U: vec(V.y*det, -U.y*det),
            V: vec(-V.x*det, U.x*det)};
}

// center of edge at theta=0
function inside_regular_poly(nsides, dist, theta, radius) {
    var sector_angle = 2*Math.PI / nsides;
    var sector_theta = (mod(theta / sector_angle + .5, 1.) - .5) * sector_angle;
    var norm_dist = dist / radius;
    return Math.cos(sector_theta) * norm_dist <= Math.cos(sector_angle / 2.);
}

function get_bounds(items, to_vec) {
    var bounds = {
        xmin: +'Infinity',
        xmax: -'Infinity',
        ymin: +'Infinity',
        ymax: -'Infinity',
    };
    $.each(items, function(i, e) {
        var v = (to_vec != null ? to_vec(e) : e);
        bounds.xmin = Math.min(bounds.xmin, v.x);
        bounds.xmax = Math.max(bounds.xmax, v.x);
        bounds.ymin = Math.min(bounds.ymin, v.y);
        bounds.ymax = Math.max(bounds.ymax, v.y);
    });
    return bounds;
}
                    

