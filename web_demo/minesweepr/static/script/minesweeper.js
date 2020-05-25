
HIDDEN_BG = 'rgb(200, 200, 200)';
VISIBLE_BG = 'rgb(230, 230, 230)';
MINE_FILL = 'rgba(0, 0, 0, .2)';
MINE_MARK_STROKE = 'black';
MINE_MARK_WRONG_STROKE = 'red';
EXPLODED = 'rgba(255, 0, 0, .8)';
COUNT_FILL = [
    // original
    'blue', 'green', 'red', 'darkblue', 'brown', 'darkcyan', 'black', 'grey',
    // unofficial
    'purple', 'yellow', 'orange', 'magenta',
    // default for higher #s
    'black'];
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

    this.populate_n = function (num_mines, board) {
        this.num_mines = Math.min(num_mines, for_analysis_only ? 'Infinity' : this.topology.num_cells());
        this.init(board, 'n_dist');
    }

    this.populate_p = function (mine_prob, board) {
        this.mine_prob = mine_prob;
        this.init(board, 'p_dist');
    }

    this.init = function (cell_data, distr_func) {
        if (cell_data != null && cell_data.length != this.topology.num_cells()) {
            console.log('pre-filled board is wrong size');
            cell_data = null;
        }
        cell_data = cell_data || (for_analysis_only ? null : this[distr_func]());
        
        for (var i = 0; i < this.topology.num_cells(); i++) {
            this.cells.push(new Cell());
        }
        this.for_each_cell(function (pos, cell, board) {
            cell.init(pos, board, cell_data);
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
        if (cell.state != 'mine' && !cell.visible) {
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
            m[i] = {state: (i < this.num_mines ? 'mine' : null)};
        }
        shuffle(m);
        return m;
    }

    this.p_dist = function () {
        m = [];
        for (var i = 0; i < this.num_cells(); i++) {
            m[i] = {state: (Math.random() < this.mine_prob ? 'mine' : null)};
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

    this.export_board_contents = function() {
        var s = '';
        var last_ix = null;
        this.for_each_cell(function(pos, cell, board) {
            if (last_ix != null) {
                var max_diff_rank = board.topology.axes.length;
                $.each(pos, function(k, v) {
                    if (last_ix[k] != v) {
                        max_diff_rank = Math.min(max_diff_rank, board.topology.axes.indexOf(k));
                    }
                });
                for (var i = max_diff_rank; i < board.topology.axes.length - 1; i++) {
                    s += board_char('separator');
                }
            }
            last_ix = pos;

            s += cell.toChar();
        });
        return s;
    }

    this.export = function() {
        var qs = new URLSearchParams();
        if (this.topology.type != 'grid') {
            qs.set('topo', this.topology.type);
        }
        var dims = this.topology.dims();
        // use fixed list to maintain ordering
        $.each(['w', 'h', 'd', 'skew'], function(i, e) {
            var key = url_param_to_input_id[e] || e;
            if (key in dims) {
                qs.set(e, dims[key]);                
            }
        });
        qs.set('mines', this.num_mines != null ? this.num_mines : (this.mine_prob < 1. ? this.mine_prob : this.topology.num_cells()));
        // forego over-aggressive escaping
        //qs.set('board', this.export_board_contents());
        return qs.toString() + '&board=' + this.export_board_contents();
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

    this.init = function(pos, board, init_board_state) {
        this.pos = pos;      
        this.name = board.topology.cell_name(pos);
        board.cells_by_name[this.name] = this;

        if (init_board_state != null) {
            var ix = board.topology.cell_ix(pos);
            this.set(init_board_state[ix]);
        }
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

    this.toChar = function() {
        if (this.visible) {
            if (this.state == 'mine') {
                return board_char('visible_mine');
            } else if (this.state == 0) {
                return board_char('blank')
            } else {
                var s = '' + this.state;
                if (s.length > 1) {
                    s = board_char('compound_start') + s + board_char('compound_end');
                }
                return s;
            }
        } else {
            if (this.flagged) {
                return board_char(this.state == 'mine' ? 'flagged_mine' : 'flag_incorrect');
            } else {
                return board_char(this.state == 'mine' ? 'mine' : 'covered');
            }
        }
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

// query strings are case insensitive
// characters have been chosen to cause minimal headaches with markdown
ALPHABET = {
    // visible cell, no neighboring mines (equivalent to '0')
    blank: '.',
    // covered cell with no mine underneath
    covered: 'x',
    // covered cell with mine underneath
    mine: 'o',
    // flagged cell with mine underneath
    flagged_mine: 'f',
    // flagged cell with no mine underneath
    flag_incorrect: '!',
    // visible (exploded in gameplay mode) mine
    visible_mine: 'm',
    // delimiter for cells whose count > 1 digit
    compound_start: '(',
    compound_end: ')',
    // delimiter between lines/layers (ignored on read)
    separator: ':',
}
function board_char(type) {
    var c = ALPHABET[type];
    if (c == null) {
        throw 'invalid char type ' + type;
    }
    return c;
}

function parse_board(s) {
    if (s == null) {
        return null;
    }

    var MAX_MINE_DIGITS = 2;
    var states = {}
    states[board_char('covered')] = {};
    states[board_char('mine')] = {state: 'mine'};
    states[board_char('flag_incorrect')] = {flagged: true};
    states[board_char('flagged_mine')] = {flagged: true, state: 'mine'};
    states[board_char('visible_mine')] = {visible: true, state: 'mine'};
    states[board_char('blank')] = {visible: true, state: 0};
    for (var i = 0; i < 10; i++) {
        states['' + i] = {visible: true, state: i};
    }
        
    result = [];
    compound_start = null;
    for (var i = 0; i < s.length; i++) {
        var c = s[i];
        var e = null;
        if (compound_start == null) {
            if (c == board_char('compound_start')) {
                compound_start = i;
            } else {
                e = states[c.toLowerCase()];
            }
        } else if (c == board_char('compound_end')) {
            var substr = s.substring(compound_start + 1, i);
            var count = +substr
            if (substr == '' || isNaN(count) || count < 0 || count != Math.floor(count)) {
                result = null;
                break;
            }
            e = {visible: true, state: count};
            compound_start = null;
        } else if (i - compound_start == MAX_MINE_DIGITS + 1) {
            result = null;
            break;
        }
        if (e != null) {
            result.push(e);
        }
    }
    if (compound_start != null) {
        result = null;
    }
    if (result == null) {
        console.log('board parse error');
    }
    return result;
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

