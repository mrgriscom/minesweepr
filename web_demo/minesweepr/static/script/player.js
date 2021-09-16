
ANALYZER = false;
ANALYSIS_SOLVE_TIMEOUT = 330;  // ms

$(document).ready(function() {
    warm_api();
    init_legend();
    
    init_canvas();
    $(window).resize(resize_canvas);
    resize_canvas();

    $('input[name="topo"]').change(topoChanged);
    
    $('#start').click(function(e) {
        new_game();
        return false;
    });

    $('#step').click(function(e) {
        GAME.best_move();
        return false;
    });

    $('#undo').click(function(e) {
        undo();
        return false;
    });

    UI_CANVAS.bind('contextmenu', function(e) {
        return false;
    });
    if (!ANALYZER) {
        UI_CANVAS.bind('mouseup', function(e) {
            manual_move(e);
            return false;
        });
        $('#edit_legend').hide();
        $('#export').hide();
    } else {
        registerCursorHandlers();
        $('#mines').change(function() {
            GAME.change_minespec();
        });
        $('#firstsafe_opt').css('visibility', 'hidden');
        $('#showmines_opt').hide();
        $('#showsol_opt').hide();
        $('#stepdiv').hide();
        $('#totalrisk').hide();
    }
    
    $('#show_mines').click(function(e) {
        GAME.refresh();
    });
    $('#show_sol').click(function(e) {
        GAME.refresh();
    });
    $('#show_sol').change(function(e) {
        $('#legend')[$(e.target).attr('checked') ? 'show' : 'hide']();
    });
    
    $('#swapmineformat').click(function(e) {
        $('#mines').val(swapmineformat());
    });

    $('#export').click(export_url);
    
    UI_CANVAS.mousemove(hover_overlays);
    UI_CANVAS.mouseout(function(e) {
        hover_overlays(null);
    });
    hover_overlays(null);  // hide tooltip div
    $('#win').hide();
    $('#fail').hide();
    $('#inconsistent').hide();
    set_spinner(null);

    if (!ANALYZER) {
        shortcut.add('enter', function() { GAME.best_move(); });
    }
    shortcut.add('ctrl+enter', function() { new_game(); });
    shortcut.add('ctrl+z', undo);
    shortcut.add('ctrl+left', undo);

    set_defaults();
    new_game(get_preset_board());
});

function registerCursorHandlers() {
    // mouse interaction - sets cursor
    UI_CANVAS.bind('mousedown', function(e) {
        GAME.cursor.dragstart(e);
    });
    UI_CANVAS.bind('mousemove', function(e) {
        GAME.cursor.drag(e);
    });
    $(window).bind('mouseup', function(e) {
        GAME.cursor.dragend(e);
    });

    // keyboard interaction - cursor
    $.each([false, true], function(i, extend_range) {
        var prefix = (extend_range ? 'shift+' : '');
        shortcut.add(prefix + 'up', function() { GAME.cursor.step('y', false, extend_range); }, {disable_in_input: true});
        shortcut.add(prefix + 'down', function() { GAME.cursor.step('y', true, extend_range); }, {disable_in_input: true});
        shortcut.add(prefix + 'left', function() { GAME.cursor.step('x', false, extend_range); }, {disable_in_input: true});
        shortcut.add(prefix + 'right', function() { GAME.cursor.step('x', true, extend_range); }, {disable_in_input: true});
        shortcut.add(prefix + 'page_up', function() { GAME.cursor.step('z', false, extend_range); }, {disable_in_input: true});
        shortcut.add(prefix + 'page_down', function() { GAME.cursor.step('z', true, extend_range); }, {disable_in_input: true});
    });
    shortcut.add('esc', function() { GAME.cursor.clear(); });
    
    // keyboard interaction - state change
    for (var i = 0; i < 10; i++) {
        // closure due to for-loop variable
        shortcut.add('' + i, (function(x) {
            return function() { GAME.cursor.set_cell_state(x); }
        })(i), {disable_in_input: true});
    }
    shortcut.add(' ', function() { GAME.cursor.set_cell_state(0); }, {disable_in_input: true});
    shortcut.add('m', function() { GAME.cursor.set_cell_state('mine'); }, {disable_in_input: true});
    shortcut.add('f', function() { GAME.cursor.set_cell_state('flag'); }, {disable_in_input: true});
    shortcut.add('delete', function() { GAME.cursor.set_cell_state(null); }, {disable_in_input: true});
    shortcut.add('shift+plus' /* gross */, function() { GAME.cursor.incr_cell_state(true); }, {type: 'keypress', disable_in_input: true});
    shortcut.add('=', function() { GAME.cursor.incr_cell_state(true); }, {type: 'keypress', disable_in_input: true});
    shortcut.add('-', function() { GAME.cursor.incr_cell_state(false); }, {type: 'keypress', disable_in_input: true});
}

function get_url_defaults() {
    var params = new URLSearchParams(window.location.search);

    var topo = params.get('topo');
    if (topo != null) {
        topo = topo.toLowerCase();
        var match = false;
        $.each($('input[name="topo"]'), function(i, e) {
            if (topo == $(e).val()) {
                match = true;
                return false;
            }
        });
        if (!match) {
            console.log('don\'t recognize topo type ' + topo);
            topo = null;
        }
    }
    topo = topo || 'grid';

    var args = {topo: topo};
    $.each(['w', 'h', 'd', 'skew', 'mines'], function(i, e) {
        args[e] = params.get(e);
    });
    return args;
}

var url_param_to_input_id = {
    'w': 'width',
    'h': 'height',
    'd': 'depth',
};

function set_defaults() {
    cached_dimensions = {
        _2d: {
            width: 30,
            height: 16,
            mines: 99,
        },
        _3d: {
            width: 6,
            height: 10,
            depth: 8,
            mines: 80,
        },
        geo: {
            width: 4,
            skew: 0,
            mines: '25%',
        },
    };
    active_dimension = null;
    
    var defaults = get_url_defaults();
    $.each(defaults, function(k, v) {
        if (v == null) {
            return;
        }
        
        // presence of keys in this dict is used to show/hide the relevant input fields,
        // so don't set keys that weren't already there from the start
        var dict = cached_dimensions[topo_dim(defaults.topo)];
        var key = url_param_to_input_id[k] || k;
        if (key in dict) {
            dict[key] = v;
        }
    });
    
    selectChoice($('input[name="topo"][value="' + defaults.topo + '"]'));
    selectChoice($('#first_safe'), !ANALYZER);
    selectChoice($('#show_mines'), false);
    selectChoice($('#show_sol'));
    selectChoice($('#highlighting'));
}

function topo_dim(topo) {
    var _3d = ['cube3d', 'cube2d'];
    var geo = ['geohex', 'geotri'];
    return (_3d.indexOf(topo) != -1 ? '_3d' :
            (geo.indexOf(topo) != -1 ? 'geo' :
             '_2d'));
}

function topoChanged(e) {
    var selected = $(e.target).val();
    var cur_dimension = topo_dim(selected);

    if (active_dimension != cur_dimension) {
        if (active_dimension != null) {
            $.each(Object.keys(cached_dimensions[active_dimension]), function(i, e) {
                cached_dimensions[active_dimension][e] = $('#' + e).val();
            });
        }
        $.each(cached_dimensions[cur_dimension], function(k, v) {
            $('#' + k).val(v);
        });
        $.each(['width', 'height', 'depth', 'skew'], function(i, e) {
            var relevant = (e in cached_dimensions[cur_dimension]);
            $('#' + e + '_field')[relevant ? 'show' : 'hide']();
            $('#' + e + '_lab')[relevant ? 'show' : 'hide']();
        });
        active_dimension = cur_dimension;
    }
}

function get_preset_board() {
    var params = new URLSearchParams(window.location.search);
    var board = parse_board(params.get('board'));
    if (board != null && !ANALYZER) {
        // TODO, in order to support:
        // need to verify validity of board (don't allow inconsistent states)
        // handle first-safe mine swapping satisfactorily
        // update state vars like first_move and total_risk
        // allow visible/exploded mines from the start?
        console.log('pre-set boards not supported yet in gameplay mode');
        board = null;
    }
    return board;
}

function get_setting(name) {
    return $('#' + name).attr('checked');
}

function selectChoice(elem, enabled) {
    elem.attr('checked', enabled != null ? enabled : true);
    elem.trigger('change');
}

function parsemine(raw, surface_area) {
    var mode = 'count';
    var k;
    if (raw[raw.length - 1] == '%') {
        raw = raw.substring(0, raw.length - 1);
        k = raw * 0.01;
        k = Math.round(surface_area * k);
    } else {
        k = +raw;
        if (k > 0. && k < 1.) {
            mode = 'prob';
        } else {
            k = Math.round(k);
        }
    }
    k = Math.max(isNaN(k) ? 0 : k, 0);
    return {mode: mode, k: k};
}

function swapmineformat() {
    var raw = $('#mines').val();
    var topo = get_topo();
    
    if (raw[raw.length - 1] == '%') {
        raw = raw.substring(0, raw.length - 1);
        var k = raw * 0.01;
        return Math.round(topo.num_cells() * k);
    } else {
        var k = +raw;
        k = 100. * k / topo.num_cells();
        return +(k.toFixed(3)) + '%';
    }
}

function writeminespec(board) {
    if (board.mine_prob) {
        $('#mines').val(board.mine_prob);
    } else {
        var curstr = $('#mines').val();
        var cur_fmt_is_pct = curstr[curstr.length - 1] == '%';
        var mines = board.num_mines;
        if (cur_fmt_is_pct) {
            var k = 100. * mines / board.topology.num_cells();
            mines = +(k.toFixed(3)) + '%';
        }
        $('#mines').val(mines);
    }
}

function get_topo() {
    var topo_type = $('input[name="topo"]:checked').val();
    var parse = function(id, allow_zero) {
        var val = Math.round(+$(id).val());
        val = isNaN(val) ? 0 : val;
        return Math.max(val, allow_zero ? 0 : 1);
    }
    return new_topo(topo_type, parse('#width'), parse('#height'), parse('#depth'), parse('#skew', true));
}

function new_game(board_data) {
    var first_safe = get_setting('first_safe');
    var topo = get_topo();
    var minespec = parsemine($('#mines').val(), topo.num_cells());
    var board = new_board(topo, minespec, board_data);
    GAME = new GameSession(board, $('#game_canvas')[0], $('#solution')[0], $('#cursor')[0], first_safe);
    
    game_reset();
    GAME.start();
}

function game_reset() {
    UNDO_STACK = [];
    SOLUTIONS = {};
}

function new_topo(type, w, h, d, skew) {
    var topo = (function() {
        if (type == 'grid') {
            return new GridTopo(w, h);
        } else if (type == 'torus') {
            return new GridTopo(w, h, true);
        } else if (type == 'grid2') {
            return new GridTopo(w, h, false, function(topo, pos, do_) {
                if (topo.wrap) {
                    throw 'adjacency logic doesn\'t support wrapping';
                }
                topo.for_radius(pos, 2, function(ix) {
                    if (Math.abs(pos.r - ix.r) + Math.abs(pos.c - ix.c) <= 3) {
                        do_(ix);
                    }
                });
            });
        } else if (type == 'hex') {
            return new HexGridTopo(w, h);
        } else if (type == 'cube3d') {
            return new Cube3dTopo(w, h, d);
        } else if (type == 'cube2d') {
            return new CubeSurfaceTopo(w, h, d);
        } else if (type == 'geohex') {
            return new GeodesicTopo(w, skew, true);
        } else if (type == 'geotri') {
            return new GeodesicTopo(w, skew, false);
        }
    })();
    topo.type = type;
    return topo;
}

function new_board(topo, minespec, board_data) {
    var board = new Board(topo, ANALYZER);
    board[{'count': 'populate_n', 'prob': 'populate_p'}[minespec.mode]](minespec.k, board_data);
    return board;
}

function manual_move(e) {
    var pos = GAME.mouse_cell(e);
    if (!pos) {
        return;
    }
    
    GAME.manual_move(pos, {1: 'sweep', 2: 'sweep-all', 3: 'mark-toggle'}[e.which]);
}

function undo() {
    var snapshot = pop_state();
    if (window.GAME && snapshot) {
        GAME.restore(snapshot);
    }
}

function GameSession(board, canvas, solution_canvas, cursor_canvas, first_safe) {
    this.board = board;
    this.first_safe = first_safe;
    this.cursor = (ANALYZER ? new EditCursor(this, cursor_canvas) : null);
    
    this.start = function() {
        this.seq = next_seq();
        this.status = 'in_play';
        this.total_risk = 0.;
        this.first_move = true;
        this.solution = null;
        // a list of solved mines (as opposed to user-flagged mines), to make subsequent solving
        // more efficient
        this.known_mines = [];
        
        //note: a board that is all mines is 'solved' from the very start (in non-strict mode), however,
        //we won't check for this until the user takes some action, because the degenerate-case solution
        //is interesting to present
        
        this.draw_ctx = new DrawContext(this, canvas, solution_canvas);
        board.set_draw(this.draw_ctx);
        this.draw_ctx.draw_board();
        reset_canvas(this.draw_ctx.solution_canvas);
        
        if (this.first_safety()) {
            this.solve_first_safe();
        } else {
            this.solve();
        }
        this.refresh();
        if (this.cursor) {
            this.cursor.render();
        }
        
        push_state();
    }
    
    this.refresh = function() {
        if (!ANALYZER) {
            this.update_stats();
        } else {
            this.update_minecount_analysis_mode();
        }
        this.set_solution_visibility();
        this.draw_ctx.refresh();
        OVERLAY_UPDATE();
    }
    
    this.set_solution_visibility = function() {
        $(this.draw_ctx.solution_canvas)[this.show_solution() ? 'show' : 'hide']();
        $('#solution-valid')[this.show_solution() ? 'show' : 'hide']();
        $('.solution-status').css('visibility', this.show_solution() ? 'visible' : 'collapse');
        // tooltip handles itself
    }
    
    this.solve = function() {
        var sol_context = new_solving_context(this);
        sol_context.refresh();
        
        var game = this;
        var seq = this.seq;
        solve_query(this.board, SOLVER_URL, function (solution, proc_time) {
            sol_context.update(solution != null ? new Solution(solution) : null, proc_time);
            // make sure the game state this solution is for is still the current one
            if (GAME == game && seq == game.seq) {
                game.set_solution(sol_context);
            }
        }, function(board) {
            return ANALYZER ? board.game_state(null, true) : board.game_state(game.known_mines);
        });
    }
    
    this.set_solution = function(sc) {
        this.solution = sc.solution;
        if (this.solution) {
            this.solution.process(this.board);
            
            var game = this;
            var is_known = in_set(this.known_mines);
            this.solution.each(this.board, function (pos, cell, prob, board) {
                if (prob > 1. - EPSILON && !is_known(cell.name)) {
                    game.known_mines.push(cell.name);
                }
            });
        }
        this.board.for_each_cell(function(pos, cell, board) {
            // don't render for uncovered cells
            // handle here rather than in cell redraw() because we want old solution to show over newly exposed cells until
            // updated solution is ready (it just looks better)
            if (sc.solution != null && !cell.visible) {
                cell.set({'prob': sc.solution.get_prob(pos, board), 'best_guess': sc.solution.best_guesses[cell.name] != null});
            } else {
                cell.set({'prob': null});
            }
            
        });
        
        if (this.solution) {
            this.solution.render(this.draw_ctx);
        } else {
            reset_canvas(this.draw_ctx.solution_canvas);
        }
        
        OVERLAY_UPDATE();
        if (ANALYZER) {
            // solution is used to update mine counts in analyzer mode
            this.update_minecount_analysis_mode();
        }
        
        sc.refresh();
    }
    
    this.manual_move = function(pos, type) {
        if (this.first_safety() && type == 'sweep') {
            this.board.ensure_safety(pos);
        }
        
        var game = this;
        this.action(function(uncovered) {
            if (type == 'sweep') {
                uncovered.push(pos);
                return game.board.uncover(pos);
            } else if (type == 'sweep-all') {
                return game.board.uncover_neighbors(pos, uncovered);
            } else if (type == 'mark-toggle') {
                game.board.flag(pos, 'toggle');
                return null;
            }
        });
    }
    
    this.best_move = function() {
        var game = this;
        var solu = this.solution;
        this.action(function(uncovered) {
            var action = false; 
            var survived = true;
            
            // we don't add known safe cells to uncovered for efficiency,
            // but update_risk could handle it if we did
            
            if (game.first_safety()) {
                game.board.uncover(game.board.safe_cell(), true);
                action = true;
            } else if (solu) {
                var guesses = Object.keys(solu.best_guesses); 
                var guess = guesses.length > 0 ? choose_rand(guesses) : null;
                
                solu.each(game.board, function (pos, cell, prob, board) {
                    if (prob < EPSILON) {
                        board.uncover(pos, true);
                        action = true;
                    } else if (prob > 1. - EPSILON) {
                        board.flag(pos);
                    } else if (cell.name == guess) {
                        survived = board.uncover(pos, true);
                        uncovered.push(pos);
                        action = true;
                    }
                });
            }
            
            return (action ? survived : null);
        });
    }

    var strict_completeness = false;
    this.action = function(move) {
        if (this.status != 'in_play') {
            return;
        }
        
        var uncovered_cells = [];
        var survived = move(uncovered_cells);
        
        if (survived == false) {
            // must explicitly check false as null ('no action') doesn't lose game
            this.status = 'fail';
        } else if (this.board.is_complete(strict_completeness)) {
            // must check even on not 'changed', as flagging alone can trigger completeness in certain situations
            this.status = 'win';
        }
        
        var changed = (survived != null);
        if (changed) {
            this.update_risk(uncovered_cells);
            this.solution = null;
            this.first_move = false;
        }
        // note this is always called even if the move was a no-op, mostly because we need to update mine counts
        // in response to flagging changes, and tracking flag changes vs. no-ops is a big PITA; triggering
        // refresh() isn't that expensive in comparison
        this.onstatechange(changed, this.status == 'in_play');
    }
    
    this.onstatechange = function(board_changed, do_solve, timeout) {
        var that = this;
        var commit = function() {
            that.seq = next_seq();
            push_state();
            if (do_solve) {
                that.solve();
            }
        }
        
        if (board_changed) {
            if (timeout) {
                clearTimeout(this.timer);
                this.timer = setTimeout(commit, timeout);
            } else {
                commit();
            }
        }
        this.refresh();
    }
    
    this.update_risk = function(cells_played) {
        if (this.total_risk == null) {
            // risk already unknown
            return;
        }
        
        var prob = 0.;
        var game = this;
        var solu = this.solution;
        var uncertain = [];
        $.each(cells_played, function(i, pos) {
            var p = (solu ? solu.get_prob(pos, game.board) : null);
            if (p == null) {
                // moved on cell w/o solution; risk unknown
                prob = null;
                return false;
            } else if (p > 1. - EPSILON) {
                // moved on known mine; risk 100%
                prob = 1.;
                return false;
            } else if (p > EPSILON) {
                uncertain.push(p);
            }
        });
        
        if (prob != null && prob < 1.) {
            if (uncertain.length > 1) {
                // moved on multiple uncertain cells; risk now unknown
                prob = null;
            } else if (uncertain.length == 1) {
                prob = uncertain[0];
            }
        }
        
        if (prob == null) {
            this.total_risk = null;
        } else {
            this.total_risk = 1. - (1. - this.total_risk) * (1. - prob);
        }
    }
    
    this.update_stats = function() {
        var mi = this.board.mine_counts();
        var mines_remaining = mi.total - (mi.flagged + mi.flag_error);
        if (this.status == 'win') {
            mines_remaining = 0;
        }
        var remain_str = mines_remaining + (this.game_mode() == 'prob' && mines_remaining != mi.total ? '/' + mi.total : '');
        if (this.game_mode() == 'count') {
            var $mines = $('<div><span id="nmines">' + remain_str + '</span></div>');
        } else {
            var $mines = $('<div>' + (this.show_mines() ? '<span id="nmines">(' + remain_str + ')</span>' : '??') + '</div>');
        }
        if (this.show_mines() ? mi.flag_error > 0 : mines_remaining < 0) {
            $mines.find('#nmines').css('color', 'red');
        }
        $('#num_mines').html($mines);
        
        if (this.total_risk == null) {
            var $risk = $('<span title="You moved on a cell before a solution was ready. We don\'t know how risky this move was, therefore total risk is now unknown.">??</span>');
        } else {
            var $risk = fmt_pct(this.total_risk);
        }
        $('#risk').html($risk);
        
        $('#win')[this.status == 'win' ? 'show' : 'hide']();
        $('#fail')[this.status == 'fail' ? 'show' : 'hide']();
    }
    
    this.update_minecount_analysis_mode = function() {
        if (this.game_mode() == 'count') {
            s = this.board.num_mines;
            mc = this.board.mine_counts();
            s -= (mc.flagged + mc.flag_error); // count all flags
            
            var visible_mines = 0;
            this.board.for_each_cell(function(pos, cell, board) {
                if (cell.visible && cell.state == 'mine') {
                    visible_mines++;
                }
            });
            s -= visible_mines;
            
            var deduced_mines_nonflagged = 0;
            if (this.show_solution()) {
                this.board.for_each_cell(function(pos, cell, prob, board) {
                    if (cell.prob > 1. - EPSILON && !cell.flagged && !cell.visible) {
                        deduced_mines_nonflagged++;
                    }
                });
            }
            s -= deduced_mines_nonflagged;
            
            $('#num_mines').css('color', s < 0 ? 'red' : '');
        } else {
            s = '??';
        }
        $('#num_mines').html(s);
    }
    
    this.change_minespec = function() {
        // this is only safe to do for boards in analysis mode, since we never actually
        // allocate and place the mines
        var minespec = parsemine($('#mines').val(), this.board.topology.num_cells());
        var changed = false;
        if (minespec.mode == 'count') {
            if (this.board.num_mines != minespec.k) {
                this.board.num_mines = minespec.k;
                this.board.mine_prob = null;
                changed = true;
            }
        } else if (minespec.mode == 'prob') {
            if (this.board.mine_prob != minespec.k) {
                this.board.mine_prob = minespec.k;
                this.board.num_mines = null;
                changed = true;
            }
        }
        if (changed) {
            this.cursor.commit_state(changed);
        }
    }
    
    this.game_mode = function() {
        return (this.board.mine_prob ? 'prob' : 'count');
    }

    this.show_mines = function() {
        return get_setting('show_mines') || this.status != 'in_play';
    }
    
    this.show_solution = function() {
        return get_setting('show_sol') && this.status == 'in_play';
    }
    
    this.first_safety = function() {
        if (this.board_full == null) {
            var board_full = (this.board.mine_counts().total == this.board.num_cells());
        }
        
        return (this.first_safe && this.first_move && !board_full);
    }
    
    this.solve_first_safe = function() {
        var sol_context = new_solving_context(this);
        sol_context.update(new Solution({_other: 0.}), 0.);
        this.set_solution(sol_context);
    }
    
    this.mouse_cell = function(e) {
        var coord = mousePos(e, this.draw_ctx.canvas);
        return this.board.cell_from_xy(coord, this.draw_ctx.canvas);
    }
    
    this.snapshot = function() {
        return {
            seq: this.seq,
            risk: this.total_risk,
            first: this.first_move,
            board_state: this.board.snapshot(),
            known_mines: this.known_mines.slice(0),
        };
    }
    
    this.restore = function(snapshot) {
        this.seq = snapshot.seq;
        this.status = 'in_play';
        this.total_risk = snapshot.risk;
        this.first_move = snapshot.first;
        this.known_mines = snapshot.known_mines.slice(0);
        
        // these must happen in this order
        this.board.restore(snapshot.board_state);
        this.refresh();
        this.set_solution(SOLUTIONS[this.seq]);
        
        if (ANALYZER) {
            // analysis mode can change # of mines in board, and this is the only place
            // that info is shown
            writeminespec(this.board);
        }
    }
}

function solve_query(board, url, callback, get_state) {
    get_state = get_state || function(board) { return board.game_state(); };
    $.post(url, JSON.stringify(get_state(board)), function (data) {
        if (data.error) {
            callback(null, null);
        } else {
            callback(data.solution, data.processing_time);
        }
    }, "json");
}

// make a call to solve a degenerate board to avoid cold starts with any
// cloud function providers
function warm_api() {
    solve_query(null, SOLVER_URL, function(){}, function(b) {
        return {rules: [], total_cells: 0, total_mines:0}
    });
}

function DrawContext (sess, canvas, solution_canvas) {
    this.board = null;
    this.canvas = canvas;
    this.solution_canvas = solution_canvas;
    
    this.draw_board = function() {
        reset_canvas(this.canvas);
        this.board.for_each_cell(function (pos, cell, board) {
            cell.draw(true);
        });
    }
    
    this.draw_solution = function() {
        reset_canvas(this.solution_canvas);
        this.board.for_each_cell(function (pos, cell, board) {
            cell.draw_solution(true);
        });
    }
    
    this.render_overlay = function(pos, canvas, fill) {
        this.draw(this.board.get_cell(pos), 'render_overlay', canvas, false, {fill: fill});
    }
    
    this.render_cursor = function(pos, canvas) {
        this.draw(this.board.get_cell(pos), 'render_cursor', canvas, false);
    }
    
    // if clear_first is false, canvas as a whole has already been cleared; cell needn't worry about overdrawing itself
    // if clear_always, always clear due to transparency (i.e., ignore when cell geometry doesn't require pre-clearing
    // when opaque)
    this.draw = function(cell, drawfuncname, canvas, clear_first, args, clear_always) {
        var geom = this.board.topology.geom(cell.pos, canvas);
        var ctx = canvas.getContext('2d');
        if (clear_first) {
            ctx.beginPath();
            var needs_clear = geom.path(ctx, true);
            if (needs_clear || clear_always) {
                var compop = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.globalCompositeOperation = compop;
            }
        }
        cell[drawfuncname](geom, ctx, args);
    }
    
    this._params = function() {
        return {
            show_mines: sess.show_mines() && !sess.first_safety(),
        }
    }
    this.params = this._params();
    
    // check if global rendering params have changed and if so propogate to cells
    this.refresh = function() {
        var new_params = this._params();
        var diff = {};
        var that = this;
        $.each(new_params, function(k, v) {
            if (that.params[k] != v) {
                diff[k] = v;
            }
        });
        this.params = new_params;
        if (Object.keys(diff).length > 0) {
            this.board.for_each_cell(function(pos, cell, board) {
                cell.needs_redraw({params: diff});
            });
        }
    }
}

function EditCursor(sess, canvas) {
    this.board = sess.board;
    this.canvas = canvas;
    this.selected_cells;
    this.active_region;
    this.region_is_negative;
    this.timer;
    // note init() at bottom
    
    // subsection: manage internal cursor state
    
    this.clear_cursor = function() {
        this.selected_cells = {};
        this.active_region = null;
    }

    this.default_cursor = function() {
        this.clear_cursor();
        this.new_active_region({...this.board.cells[0].pos});
    }
    
    this.new_active_region = function(loc) {
        this.apply_region(this.selected_cells);
        this.active_region = [loc, {...loc}];
        this.region_is_negative = Boolean(this.selected_cells[this.key(loc)]);
    }
    
    this.extend_active_region = function(loc) {
        this.active_region[1] = loc;
    }
    
    this.apply_region = function(cells) {
        if (this.active_region == null) {
            return;
        }       
        var that = this;
        this.board.topology.for_select_range(this.active_region[0], this.active_region[1], function(pos) {
            if (that.region_is_negative) {
                delete cells[that.key(pos)];
            } else {
                cells[that.key(pos)] = true;
            }
        });
    }
    
    this.for_cursor = function(do_) {
        var cells = {}
        $.each(this.selected_cells, function(k, v) {
            cells[k] = true;
        });
        this.apply_region(cells);
        this.board.for_each_name(Object.keys(cells), do_);
    }
    
    // subsection: handle UI events to update state
    
    this.clear = function() {
        this.clear_cursor();
        this.render();
    }
    
    this.step = function(axis, dir, extend_range) {
        if (this.active_region == null) {
            this.default_cursor();          
        } else {
            var loc = {...this.active_region[extend_range ? 1 : 0]};
            this.board.topology.increment_ix(loc, axis, dir);
            if (extend_range) {
                this.extend_active_region(loc);
            } else {
                this.clear_cursor();
                this.new_active_region(loc);
            }
        }
        this.render();
    };
    
    this.in_drag = false;
    this.dragstart = function(e) {
        var pos = this.mouse_cell(e);
        if (!pos) {
            this.clear();
        } else if (e.which == 3) {
            sess.manual_move(pos, 'mark-toggle');
        } else if (e.which == 1) {
            this.in_drag = true;
            if (e.shiftKey) {
                this.extend_active_region(pos);
            } else if (e.ctrlKey) {
                this.new_active_region(pos);
            } else {
                this.clear_cursor();
                this.new_active_region(pos);
            }
            this.render();
        }
    }
    
    this.dragend = function(e) {
        this.in_drag = false;
    }
    
    this.drag = function(e) {
        if (!this.in_drag) {
            return;
        }
        var pos = this.mouse_cell(e);
        if (!pos) {
            return;
        }
        this.extend_active_region(pos);
        this.render();
    }
    
    // subsection: handle UI events that apply current state to modify board
    
    this.set_cell_state = function(num_mines) {
        var changed = false;
        this.for_cursor(function(pos, cell, board) {
            var hidden = (num_mines == null || num_mines == 'flag');
            var modified = cell.set({
                visible: !hidden,
                state: hidden ? 0 : num_mines,
                flagged: (num_mines == 'flag'),
            });
            
            if ('visible' in modified || 'state' in modified) {
                changed = true;
            }
        });
        this.commit_state(changed);
    }
    
    this.incr_cell_state = function(up) {
        var changed = false;
        this.for_cursor(function(pos, cell, board) {
            if (cell.visible && cell.state != 'mine') {
                var modified = cell.set({state: Math.min(Math.max(cell.state + (up ? 1 : -1), 0), board.topology.adjacent(cell.pos).length)});
                if ('state' in modified) {
                    changed = true;
                }
            }
        });
        if (changed) {
            this.commit_state(changed);
        }
    }

    this.commit_state = function(changed) {
        sess.onstatechange(changed, true, ANALYSIS_SOLVE_TIMEOUT);
    }
    
    // subsection: rendering and utils
    
    this.render = function() {
        reset_canvas(this.canvas);
        var that = this;
        this.for_cursor(function(pos, cell, board) {
            sess.draw_ctx.render_cursor(pos, that.canvas);
        });
    }
    
    this.mouse_cell = function(e) {
        var pos = sess.mouse_cell(e);
        // copy because it will be mutable
        return (pos != null ? {...pos} : null);
    }
    
    this.key = function(loc) {
        return this.board.get_cell(loc).name;
    }
    
    this.init = function() {
        this.default_cursor();
    }
    this.init();
}

function Solution(probs) {
    this.cell_probs = probs;
    this.best_guesses = {};
    this.other_cells = {};
    
    this.process = function(board) {
        this.enumerate_other(board);
        
        var must_guess = true;
        var guesses = [];
        var min_prob = 1.;
        this.each(board, function (pos, cell, prob, board) {
            if (cell.visible) {
                // present in 'everything mode' solutions; ignore
            } else if (prob < EPSILON) {
                must_guess = false;
            } else if (prob < 1. - EPSILON) {
                guesses.push({name: cell.name, p: prob});
                min_prob = Math.min(min_prob, prob);
            }
        });
        
        if (must_guess) {
            var solu = this;
            $.each(guesses, function(i, guess) {
                if (guess.p < min_prob + EPSILON) {
                    solu.best_guesses[guess.name] = true;
                }
            });
        }
    }
    
    this.each = function(board, func) {
        var _apply = function(cell_names, get_prob) {
            board.for_each_name(cell_names, function (pos, cell, board) {
                func(pos, cell, get_prob(cell.name, board), board);
            });
        }
        
        var names = [];
        for (var name in this.cell_probs) {
            if (name != '_other') {    
                names.push(name);
            }
        }
        var solu = this;
        _apply(names, function(name) { return solu.cell_probs[name]; });
        _apply(Object.keys(this.other_cells), function(name) { return solu.other_prob(); });
    }
    
    this.render = function(draw_ctx) {
        draw_ctx.draw_solution();
    }
    
    this.get_prob = function(pos, board) {
        var prob = null;
        var cell = board.get_cell(pos);
        prob = this.cell_probs[cell.name];
        if (prob == null && this.other_cells[cell.name] != null) {
            prob = this.other_prob();
        }
        return prob;
    }
    
    this.other_prob = function() {
        return this.cell_probs['_other'];
    }
    
    this.enumerate_other = function(board) {
        var other_prob = this.other_prob();
        if (other_prob != null) {
            var solu = this;
            board.for_each_cell(function (pos, cell, board) {
                if (!cell.visible && solu.cell_probs[cell.name] == null) {
                    solu.other_cells[cell.name] = true;
                }
            });
        }
    }
}

function SolvingContext() {
    this.solution = null;
    this.proc_time = null;
    
    this.update = function(solution, proc_time) {
        this.solution = solution;
        this.proc_time = (proc_time == null ? -1. : proc_time);
    }
    
    this.refresh = function() {
        set_spinner(this.state(), this.proc_time);
        $('#inconsistent')[this.state() == 'inconsistent' ? 'show' : 'hide']();
    }
    
    this.state = function() {
        if (this.proc_time == null) {
            return 'solving';
        } else if (this.proc_time < 0.) {
            return 'timeout';
        } else if (this.solution == null) {
            return 'inconsistent';
        } else {
            return 'solved';
        }
    }
}

function new_solving_context(game) {
    var sol_context = new SolvingContext();
    // async-received solutions will still be stored in the appropriate slot in the undo stack,
    // even if they are no longer for the current game state
    SOLUTIONS[game.seq] = sol_context;
    return sol_context;
}

function init_canvas() {
    UI_CANVAS = $('#canvas_stack canvas').filter(':last');
}

function mousePos(evt, elem) {
    return {x: evt.layerX - elem.offsetLeft, y: evt.layerY - elem.offsetTop};
}

function hover_overlays(e) {
    OVERLAY_UPDATE = function() {
        if (e) {
            var xy = {x: e.pageX, y: e.pageY};
            var pos = GAME.mouse_cell(e);
        } else {
            var xy = null;
            var pos = null;
        }
        neighbor_overlay(pos);
        prob_tooltip(pos, xy);
    };
    OVERLAY_UPDATE();
}

var OVERLAY_UPDATE = function(){};
var cellname_in_tooltip = false;
function prob_tooltip(pos, mousePos) {
    var show = false;
    if (pos) {
        var cell = GAME.board.get_cell(pos);
        if (GAME.show_solution()) {
            var prob = cell.prob;
            show = (prob > EPSILON && prob < 1. - EPSILON);
        }
        if (cellname_in_tooltip) {
            show = true;
        }
    }
    
    if (show) {
        $("#tooltip").show();
        $("#tooltip").css({
            top: (mousePos.y - 15) + "px",
            left: (mousePos.x + 15) + "px"
        });
        $('#tooltip').text((cellname_in_tooltip ? cell.name + ' :: ' : '') + (prob != null ? fmt_pct(prob) : '--'));
    } else {
        $('#tooltip').hide();
    }
}

function neighbor_overlay(pos) {
    var canvas = $('#neighbor_layer')[0];
    reset_canvas(canvas);
    if (!get_setting('highlighting')) {
        return;
    }
    if (!pos) {
        return;
    }
    
    var cur_cell = GAME.board.get_cell(pos);
    if (!cur_cell.visible || cur_cell.state != 0) {
        GAME.draw_ctx.render_overlay(pos, canvas, HIGHLIGHT_CUR_CELL);
    }
    GAME.board.for_each_neighbor(pos, function (pos, neighb, board) {
        if (!neighb.visible) {
            GAME.draw_ctx.render_overlay(pos, canvas, HIGHLIGHT_NEIGHBOR);
        }
    });
}

function reset_canvas(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
}

function resize_canvas() {
    var w = Math.max(window.innerWidth - 30, 400);
    var h = Math.max(window.innerHeight - 250, 300); 
    
    $('#canvas_stack').css('width', w + 'px');
    $('#canvas_stack').css('height', h + 'px');
    
    $.each($('#canvas_stack canvas'), function(i, e) {
        e.width = w;
        e.height = h;
    });
    
    if (window.GAME) {
        GAME.draw_ctx.draw_board();
        GAME.draw_ctx.draw_solution();
    }
}

function export_url() {
    window.history.replaceState(null, null, '?' + GAME.board.export());
    
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val(window.location.href).select();
    document.execCommand("copy");
    $temp.remove();
}

function init_legend() {
    $('#legend').css('background-color', HIDDEN_BG);
    $('#legend #clear').css('background-color', prob_shade(0.));
    $('#legend #mine').css('background-color', prob_shade(1.));
    
    var mk_grad = function(start, end, vendor_prefix) {
        return (vendor_prefix ? '-' + vendor_prefix + '-' : '') + 'linear-gradient(' + (vendor_prefix ? 'left' : 'to right') + ', ' + start + ' 0%, ' + end + ' 100%)';
    };
    
    $.each([null, 'moz', 'webkit', 'o', 'ms'], function(i, e) {
        $('#legend #ambig').css('background', mk_grad(prob_shade(.001), prob_shade(.999), e));
        $('#legend #best').css('background', mk_grad(prob_shade(.001, true), prob_shade(.999, true), e));
    });
}

function fmt_pct(x) {
    return (100. * x).toFixed(2) + '%'
}

SEQ = 0;
function next_seq() {
    SEQ++;
    return SEQ;
}

function set_spinner(state, time) {
    if (state == null) {
        $('#solving').hide();
        $('#solved').hide();
        $('#timeout').hide();
    } else if (state == 'solving') {
        $('#solving').show();
        $('#solved').hide();
        $('#timeout').hide();
    } else {
        $('#solving').hide();
        $('#solved').show();
        
        if (state == 'timeout') {
            var s_time = $('<span style="font-size: 32px; line-height: 32px;">\u2620</span>');
            s_time.mousemove(function(e) { $('#timeout').show(); });
            s_time.mouseout(function(e) { $('#timeout').hide(); });
        } else {
            var s_time = time.toFixed(3) + 's';
        }
        $('#solve_time').html(s_time);
    }
}

function push_state() {
    UNDO_STACK.push(GAME.snapshot());
}

function pop_state() {
    // it's easier if the current state is always on the stack, hence these shenanigans
    // pretend the last item on the stack doesn't exist
    if (UNDO_STACK.length == 1) {
        return null;
    } else {
        UNDO_STACK.pop();
        return UNDO_STACK[UNDO_STACK.length - 1];
    }
}

function in_set(list) {
    var ix = {};
    $.each(list, function(i, e) {
        ix[e] = true;
    });
    
    return function(e) {
        return ix[e];
    }
}
