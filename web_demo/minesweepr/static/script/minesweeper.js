
HIDDEN_BG = 'rgb(200, 200, 200)';
VISIBLE_BG = 'rgb(230, 230, 230)';
MINE_FILL = 'rgba(0, 0, 0, .2)';
MINE_MARK_STROKE = 'black';
MINE_MARK_WRONG_STROKE = 'red';
EXPLODED = 'rgba(255, 0, 0, .8)';
COUNT_FILL = ['blue', 'green', 'red', 'purple', 'brown', 'cyan', 'orange', 'black'];
MARGIN = 1;
MINE_RADIUS = .5;
FONT_SIZE = .5;
FONT_OFFSET = ($.browser.mozilla ? .15 : .07);
FONT_SCALE_LONG = .8;
HIGHLIGHT_CUR_CELL = 'rgba(0, 0, 0, 0)'; //'rgba(255, 180, 0, .2)';
HIGHLIGHT_NEIGHBOR = 'rgba(255, 220, 255, .2)';
SAFE_COLOR = 'rgba(0, 0, 255, .2)';
MINE_COLOR = 'rgba(255, 0, 0, .2)';
GUESS_COLOR = '0,255,0';  // variable alpha
BEST_GUESS_COLOR = '255,255,0';  // variable alpha

EPSILON = 1.0e-6;

function Board (topology, for_analysis_only) {
    this.topology = topology;
    this.cells = [];
    this.cells_by_name = {};

    this.populate_n = function (num_mines) {
        this.num_mines = num_mines;
        this.init(this.n_dist());
    }

    this.populate_p = function (mine_prob) {
        this.mine_prob = mine_prob;
        this.init(this.p_dist());
    }

    this.init = function (mine_dist) {
        for (var i = 0; i < this.topology.num_cells(); i++) {
            this.cells.push(new Cell());
        }
        this.for_each_cell(function (pos, cell, board) {
            cell.init(pos, board, for_analysis_only ? null : mine_dist);
        });
        this.for_each_cell(function (pos, cell, board) {
            board.init_cell_state(pos, cell);
        });
    }

    this.set_draw = function(draw_ctx) {
        draw_ctx.board = this;
        this.for_each_cell(function (pos, cell, board) {
            cell.draw_ctx = draw_ctx;
        });
    }
    
    //reshuffle board so 'pos' will not be a mine
    //only allowed to be called before any cells are uncovered
    //assumes at least one cell on the board is safe
    this.ensure_safety = function(pos) {
        var cell = this.get_cell(pos);
        if (cell.state == 'mine') {
            var swap_pos = this.safe_cell();
            this.get_cell(swap_pos).set({state: 'mine'});
            cell.set({state: null});

            // re-init neighboring mine counts for relevant cells
            var board = this;
            var recalc_neighbors = function(pos) {
                board.for_each_neighbor(pos, function(pos, neighb, board) {
                    board.init_cell_state(pos, neighb);
                });
            };

            this.init_cell_state(pos, cell);
            recalc_neighbors(pos);
            recalc_neighbors(swap_pos);
        }
    }

    this.init_cell_state = function(pos, cell) {
        if (cell.state != 'mine') {
            var count = 0;
            this.for_each_neighbor(pos, function (pos, neighb, board) {
                if (neighb.state == 'mine') {
                    count++;
                }
            });
            cell.set({state: count});
        }
    }

    var cascade_overrides_flagged = false;
    //uncover a cell, triggering any cascades
    //return whether we survived, null if nothing uncovered
    this.uncover = function (pos, force) {
        // can't do straight up recursion for cascades since very large boards might
        // exceed call stack limit

        var board = this;
        var cascades = [];
        // original top-level function
        var _uncover = function (pos, force_unflag) {
            var cell = board.get_cell(pos);
            if (!cell.visible && (!cell.flagged || force_unflag)) {
                cell.set({visible: true, flagged: false});
                
                if (cell.state == 'mine') {
                    return false;
                } else {
                    if (cell.state == 0) {
                        board.for_each_neighbor(pos, function (pos, neighb, board) {
                            // would recurse here, but add to queue instead
                            cascades.push(pos);
                        });
                    }
                    return true;
                }
            }
        };
        // invoke top level and cache result
        var survived = _uncover(pos, force);
        // process the cascading cells -- note: 'cascades' may increase in length with further calls to _uncover()
        for (var i = 0; i < cascades.length; i++) {
            _uncover(cascades[i], cascade_overrides_flagged);
        }
        return survived;
    }

    //uncover all neighbors of a cell, provided the indicated number of neighboring mines
    //have all been flagged (note that these flaggings may be incorrect)
    //return whether we survived (i.e., flagged mines were all correct), null if cell
    //did not meet criteria for 'uncover all'
    //uncovered_neighbors is an array -- only a param so we can pass the info back to
    //the parent; should be empty initially
    this.uncover_neighbors = function(pos, uncovered_neighbors) {
        neighbors_to_uncover = [];
        var cell = this.get_cell(pos);

        if (!cell.visible) {
            return;
        }

        var num_flagged_neighbors = 0;
        this.for_each_neighbor(pos, function(pos, neighb, board) {
            if (neighb.flagged) {
                num_flagged_neighbors++;
            } else if (!neighb.visible) {
                neighbors_to_uncover.push(pos);
            }
        });

        if (num_flagged_neighbors != cell.state || neighbors_to_uncover.length == 0) {
            return;
        }

        var survived = true;
        var board = this;
        $.each(neighbors_to_uncover, function(i, pos) {
            var result = board.uncover(pos);
            if (result == false) {
                // need to ignore result == null: (cell was already uncovered due to
                // cascade from previous neighbor)
                survived = false;
            }
            uncovered_neighbors.push(pos);
        });
        return survived;
    }

    //'flag' a cell as a mine; mode = true (flag; default), false (clear flag), or 'toggle'
    //can only flag non-visible cells
    this.flag = function (pos, mode) {
        var cell = this.get_cell(pos);
        if (!cell.visible) {
            if (mode == null) {
                mode = true;
            }
            cell.set({flagged: (mode == 'toggle' ? !cell.flagged : mode)});
        }
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

    //return whether the board has been fully cleared. 'strict' mode requires all mines to be flagged
    this.is_complete = function (strict) {
        var complete = true;
        this.for_each_cell(function (pos, cell, board) {
            if (cell.state == 'mine') {
                var _compl = (strict ? cell.flagged : true);
            } else {
                var _compl = cell.visible;
            }
            if (!_compl) {
                complete = false;
            }
        });
        return complete;
    }

    this.mine_counts = function() {
        var total_mines = 0;
        var mines_flagged = 0;
        var nonmines_flagged = 0;
        this.for_each_cell(function (pos, cell, board) {
            if (cell.state == 'mine') {
                total_mines++;
                if (cell.flagged) {
                    mines_flagged++;
                }
            } else if (cell.flagged) {
                nonmines_flagged++;
            }
        });
        return {total: total_mines, flagged: mines_flagged, flag_error: nonmines_flagged};
    }

    this.safe_cell = function () {
        var c = [];
        this.for_each_cell(function (pos, cell, board) {
            if (!cell.visible && cell.state != 'mine') {
                c.push(pos);
            }
        });
        return choose_rand(c);
    }

    this.for_each_cell = function (func) {
        var board = this;
        this.topology.for_each_index(function(ix) {
            func(ix, board.get_cell(ix), board);
        });
    }

    // topo.adjacent() can return redundant neighbors, in order to keep its logic simpler
    // it's safer and easier to detect here as a catch-all
    this.for_each_neighbor = function (pos, func) {
        var cell = this.get_cell(pos);
        if (cell._deduped_neighbors) {
            var adj = cell._deduped_neighbors;
        } else {
            var adj = this.topology.adjacent(pos);
            if (cell._deduped_neighbors == null) {
                var uniq = {};
                for (var i = 0; i < adj.length; i++) {
                    uniq[this.topology.cell_ix(adj[i])] = adj[i];
                }
                uniq = Object.values(uniq);
                if (uniq.length != adj.length) {
                    cell._deduped_neighbors = uniq;
                    adj = cell._deduped_neighbors;
                } else {
                    cell._deduped_neighbors = false;
                }
            }
        }
        
        for (var i = 0; i < adj.length; i++) {
            var neighb_pos = adj[i];
            func(neighb_pos, this.get_cell(neighb_pos), this);
        }
    }

    this.for_each_name = function (names, func) {
        var board = this;
        $.each(names, function(i, name) {
            var cell = board.cells_by_name[name];
            func(cell.pos, cell, board);    
        });
    }

    // TODO harmonize with python algo?
    this.game_state = function (known_mines, everything_mode) {
        // known_mines is a list of cell (names) actually known to be mines.

        // to keep honest we never actually check a cell's 'mine' flag. one exception is setting explicit
        // mines in analysis mode; it's ok to check these because the cell is visible; a visible mine
        // in normal gameplay mode indicates a lost game
        
        var rules = [];
        var clear_cells = {};
        var zero_cells = {};
        var relevant_mines = {};
        var num_known_mines = 0;

        // cell_names must not be modified later!
        var mk_rule = function(num_mines, cell_names) {
            return {num_mines: num_mines, cells: cell_names};
        }

        var add_cell = function(set, cell) {
            set[cell.name] = cell;
        }

        var is_mine = (function() {
            var is_known = in_set(known_mines || []);
            return function(cell) {
                return is_known(cell.name) ||
                    // exposed mines in analysis mode
                    (cell.visible && cell.state == 'mine');
            };
        })();

        var potential_mine = function(cell) {
            return !cell.visible ||
                // exposed mines in analysis mode
                cell.state == 'mine';
        }
        
        this.for_each_cell(function (pos, cell, board) {
            if (is_mine(cell)) {
                num_known_mines += 1;
                if (everything_mode || known_mines) {
                    add_cell(relevant_mines, cell);
                }
            } else if (cell.visible) {
                add_cell(clear_cells, cell);

                var cellnames_of_interest = [];
                var mines_of_interest = [];
                var on_frontier = false;
                board.for_each_neighbor(pos, function (pos, neighbor, board) {
                    if (potential_mine(neighbor)) { //includes flagged mines
                        cellnames_of_interest.push(neighbor.name);
                        if (is_mine(neighbor)) {
                            mines_of_interest.push(neighbor);
                        } else {
                            on_frontier = true;
                        }
                    }
                });

                if (on_frontier || (everything_mode && cell.state > 0)) {
                    rules.push(mk_rule(cell.state, cellnames_of_interest));
                    $.each(mines_of_interest, function(i, mine) {
                        add_cell(relevant_mines, mine);
                    });
                }
                if (cell.state == 0) {
                    board.for_each_neighbor(pos, function (pos, neighbor, board) {
                        add_cell(zero_cells, neighbor);
                    });
                }
            }
        });

        $.each(relevant_mines, function(name, _) {
            rules.push(mk_rule(1, [name]));
        });
        if (everything_mode) {
            rules.push(mk_rule(0, Object.keys(clear_cells)));
            rules.push(mk_rule(0, Object.keys(zero_cells)));
        }

        var num_irrelevant_mines = num_known_mines - Object.keys(relevant_mines).length;
        var state = {rules: rules, total_cells: this.num_cells() - (everything_mode ? 0 : Object.keys(clear_cells).length + num_irrelevant_mines)};
        if (this.num_mines != null) {
            state.total_mines = this.num_mines - (everything_mode ? 0 : num_irrelevant_mines);
        } else {
            state.mine_prob = this.mine_prob;
        }
        
        return state;
    }

    this.cell_from_xy = function(p, canvas) {
        return this.topology.cell_from_xy(p, canvas);
    }

    this.snapshot = function() {
        var visible = {};
        var flagged = {};
        this.for_each_cell(function(pos, cell, board) {
            if (cell.visible) {
                visible[cell.name] = (for_analysis_only ? cell.state : true);
            }
            if (cell.flagged) {
                flagged[cell.name] = true;
            }
        });
        return {visible: visible, flagged: flagged, num_mines: this.num_mines, mine_prob: this.mine_prob};
    }

    this.restore = function(snapshot) {
        this.for_each_cell(function(pos, cell, board) {
            var vals = {
                visible: cell.name in snapshot.visible,
                flagged: cell.name in snapshot.flagged,
            };
            if (for_analysis_only) {
                vals.state = snapshot.visible[cell.name];
            }
            cell.set(vals);
        });
        if (for_analysis_only) {
            this.num_mines = snapshot.num_mines;
            this.mine_prob = snapshot.mine_prob;
        }
    }
}

function Cell () {
    this.name = null;
    this.pos = null;
    
    this.state = null;
    this.visible = false;
    this.flagged = false;

    this.prob = null;
    this.best_guess = null;
    
    this.draw_ctx;
    // cache if this cell's neighbors differ from those returned by adjacent() due to
    // deduplication. if yes, list of neighbors; if no, false; if not yet cached, null
    this._deduped_neighbors;

    this.init = function(pos, board, mine_dist) {
        this.pos = pos;      
        this.name = board.topology.cell_name(pos);
        board.cells_by_name[this.name] = this;
        
        var ix = board.topology.cell_ix(pos);
        this.set({state: mine_dist != null && mine_dist[ix] ? 'mine' : null});
    }

    // cells will detect changes to their state and redraw themselves as needed. therefore,
    // all state changes must go through this function. returns a dict of changed (prior) values
    this.set = function(vals) {
        var old = {};
        var that = this;
        $.each(['state', 'visible', 'flagged', 'prob', 'best_guess'], function(i, field) {
            if (field in vals && that[field] != vals[field]) {
                old[field] = that[field];
                that[field] = vals[field];
            }
        });
        this.needs_redraw(old);
        return old;
    }

    this.needs_redraw = function(old) {
        var redraw_board = false;
        // note: we don't monitor 'prob' for redraw changes, it is just cached so the cell solution
        // can be redrawn in other circumstances. this is because almost all cells change with a new
        // solution, thus more efficient to redraw in bulk
        var redraw_solution = false;
        if ('visible' in old || 'flagged' in old || ('state' in old && this.visible)) {
            redraw_board = true;
        }
        if ('params' in old) {
            if ('show_mines' in old.params &&
                ((this.state == 'mine' && !this.flagged) || (this.flagged && this.state != 'mine'))) {
                redraw_board = true;
            }
        }
        if ('flagged' in old) {
            redraw_solution = true;
        }
        
        if (redraw_board) {
            this.draw();
        }
        if (redraw_solution) {
            this.draw_solution();
        }
    }

    this.draw = function(already_cleared) {
        if (this.draw_ctx == null) {
            return;
        }
        this.draw_ctx.draw(this, 'render', this.draw_ctx.canvas, !already_cleared, {'params': this.draw_ctx.params});
    }

    this.draw_solution = function(already_cleared) {
        if (this.draw_ctx == null) {
            return;
        }
        
        var leave_clear = (this.prob == null || (this.flagged && this.prob > 1. - EPSILON));
        var fill = (leave_clear ? null : prob_shade(this.prob, this.best_guess));
        var alert = this.flagged && this.prob < 1.;

        if (already_cleared && leave_clear && !alert) {
            return;
        }

        this.draw_ctx.draw(this, 'render_overlay', this.draw_ctx.solution_canvas, !already_cleared, {fill: fill, alert: alert}, true);
    }
    
    this.render = function (g, ctx, args) {
        var params = args.params;
        
        ctx.beginPath();
        g.path(ctx);
        ctx.fillStyle = (this.visible ? VISIBLE_BG : HIDDEN_BG);
        ctx.fill();

        var draw_mine = function(mode, material) {
            ctx[mode == 'fill' ? 'fillStyle' : 'strokeStyle'] = material;

            ctx.beginPath();
            ctx.arc(g.center[0], g.center[1], .5 * g.span * MINE_RADIUS, 0, 2*Math.PI, false);

            ctx[mode == 'fill' ? 'fill' : 'stroke']();
        };

        if (this.state == 'mine' && this.visible) {
            draw_mine('fill', EXPLODED);
        } else if (this.state == 'mine' && params.show_mines && !this.flagged) {
            draw_mine('fill', MINE_FILL);
        } else if (this.flagged) {
            if (this.state == 'mine' || !params.show_mines) {
                draw_mine('line', MINE_MARK_STROKE);
            } else {
                draw_mine('line', MINE_MARK_WRONG_STROKE);
            }
        } else if (this.state > 0 && this.visible) {
            var label = '' + this.state;
            var fill = COUNT_FILL[Math.min(this.state - 1, COUNT_FILL.length - 1)];
            var size = (label.length > 1 ? FONT_SCALE_LONG : 1.);
            textContext(ctx, g, fill, size)(label);
        }
    }

    this.render_overlay = function (g, ctx, args) {
        var fill = args.fill;
        var alert = args.alert;

        if (fill != null) {
            ctx.beginPath();
            g.path(ctx);
            ctx.fillStyle = fill;
            ctx.fill();
        }
        
        if (alert) {
            textContext(ctx, g, 'rgba(0, 0, 0, .6)', 1.4 * MINE_RADIUS, true)('!');
        }
    }

    this.render_cursor = function(g, ctx) {
        ctx.beginPath();
        g.path(ctx);

        ctx.save();
        ctx.clip();
        
        ctx.strokeStyle = "#ff000060";
        ctx.lineWidth = g.span / 7. * 2 /* only one half is rendered; other half is clipped out */;
        ctx.stroke();

        ctx.restore();
    }
}

function textContext(ctx, g, fill, size, bold) {
    var font_size = size * g.span * FONT_SIZE;
    ctx.fillStyle = fill;
    ctx.font = (bold ? 'bold ' : '') + font_size + 'pt sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return function(label) {
        ctx.fillText(label, g.center[0], g.center[1] + font_size * FONT_OFFSET);
    };
}

function prob_shade (p, best) {
    if (p < EPSILON) {
        return SAFE_COLOR;
    } else if (p > 1 - EPSILON) {
        return MINE_COLOR;
    } else {
        var MIN_ALPHA = (best ? .15 : .05);
        var MAX_ALPHA = .8;
        var alpha = MIN_ALPHA * (1 - p) + MAX_ALPHA * p;
        return 'rgba(' + (best ? BEST_GUESS_COLOR : GUESS_COLOR) + ',' + alpha + ')';
    }
}

/* Topo classes implement various board topologies; they must implement the following interface:

   [constructor] - sets board dimensions + other optional parameters
   num_cells() - return number of cells on board
   for_each_index(func(pos)) - iterate through the indexes of all cells on the board (index format determined
   by topology) and call func with each index
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

    this.cell_name = function (pos) {
        return pad_to(pos.r + 1, this.height) + '-' + pad_to(pos.c + 1, this.width + 1);
    }

    this.cell_ix = function (pos) {
        return pos.r * this.width + Math.floor(pos.r / 2) + pos.c;
    }

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
    
    this.for_range = function(x0, x1, y0, y1, z0, z1, do_) {
        x0 = Math.max(x0, 0);
        y0 = Math.max(y0, 0);
        z0 = Math.max(z0, 0);
        x1 = Math.min(x1, this.w - 1);
        y1 = Math.min(y1, this.h - 1);
        z1 = Math.min(z1, this.d - 1);
        for (var x = x0; x <= x1; x++) {
            for (var y = y0; y <= y1; y++) {
                for (var z = z0; z <= z1; z++) {
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

function mod(a, b) {
    return ((a % b) + b) % b;
}
