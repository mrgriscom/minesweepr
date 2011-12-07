
$(document).ready(function() {
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

    UI_CANVAS.bind('mouseup', function(e) {
        manual_move(e);
        return false;
      });
    UI_CANVAS.bind('contextmenu', function(e) {
        return false;
      });

    $('#show_mines').click(function(e) {
        GAME.refresh();
      });
    $('#show_sol').click(function(e) {
        GAME.refresh();
      });
    
    $('#play_auto').click(function(e) {
        var enabled = get_setting('play_auto');
        $('#step')[enabled ? 'removeClass' : 'addClass']('disabled');
      });

    UI_CANVAS.mousemove(hover_overlays);
    UI_CANVAS.mouseout(function(e) {
        hover_overlays(null);
      });
    hover_overlays(null);
    $('#win').hide();
    $('#fail').hide();
    set_spinner(null);

    shortcut.add('enter', function() { GAME.best_move(); });
    shortcut.add('ctrl+enter', new_game);
    shortcut.add('ctrl+z', undo);
    shortcut.add('ctrl+left', undo);

    set_defaults();
    new_game();
  });

function set_defaults() {
  cached_dimensions = {_2d: [30, 16, null, 100], _3d: [6, 10, 8, 80]};
  active_dimension = null;

  selectChoice($('input[name="topo"][value="grid"]'));
  selectChoice($('#first_safe'));
  selectChoice($('#play_auto'));
  selectChoice($('#play_manual'));
  selectChoice($('#show_mines'), false);
  selectChoice($('#show_sol'));
  selectChoice($('#highlighting'));
}

function get_setting(name) {
  return $('#' + name).attr('checked');
}

function selectChoice(elem, enabled) {
  elem.attr('checked', enabled != null ? enabled : true);
  elem.trigger('change');
}

function topo_dim(topo) {
  var _3d = ['cube3d', 'cube2d'];
  return (_3d.indexOf(topo) != -1 ? '_3d' : '_2d');
}

function topoChanged(e) {
  var selected = $(e.target).val();
  var cur_dimension = topo_dim(selected);

  if (cur_dimension == '_3d') {
    $('#depth').show();
    $('#depth_lab').show();       
  } else {
    $('#depth').hide();
    $('#depth_lab').hide();
  }
  
  if (active_dimension != cur_dimension) {
    if (active_dimension != null) {
      cached_dimensions[active_dimension] = [$('#width').val(), $('#height').val(), active_dimension == '_3d' ? $('#depth').val() : null, $('#mines').val()];
    }
    $('#width').val(cached_dimensions[cur_dimension][0]);
    $('#height').val(cached_dimensions[cur_dimension][1]);
    $('#depth').val(cached_dimensions[cur_dimension][2]);
    $('#mines').val(cached_dimensions[cur_dimension][3]);
    active_dimension = cur_dimension;
  }
}

function parsemine(raw, surface_area) {
  if (raw[raw.length - 1] == '%') {
    var mode = 'prob';
    raw = raw.substring(0, raw.length - 1);
  } else {
    var mode = 'count';
  }

  var k = +raw;

  if (mode == 'prob') {
    k *= 0.01;
  } else if (mode == 'count' && k < 1.) {
    k = Math.round(surface_area * k);
  }

  return {mode: mode, k: k};
}

function new_game() {
  var topo_type = $('input[name="topo"]:checked').val();
  var width = +$('#width').val();
  var height = +$('#height').val();
  var depth = +$('#depth').val();
  var first_safe = get_setting('first_safe');

  var topo = new_topo(topo_type, width, height, depth);
  var minespec = parsemine($('#mines').val(), topo.num_cells());
  var board = new_board(topo, minespec);
  GAME = new GameSession(board, $('#game_canvas')[0], first_safe);

  game_reset();
  GAME.start();
}

function game_reset() {
  hover_overlays(null);
  UNDO_STACK = [];
}

function new_topo(type, w, h, d) {
  if (type == 'grid') {
    return new GridTopo(w, h);
  } else if (type == 'torus') {
    return new GridTopo(w, h, true);
  } else if (type == 'grid2') {
    return new GridTopo(w, h, false, function(topo, pos, do_) {
        topo.for_range(pos, 2, topo.wrap, function(r, c) {
            if (Math.abs(pos.r - r) + Math.abs(pos.c - c) <= 3) {
              do_(r, c);
            }
          });
    });
  } else if (type == 'hex') {
    return new HexGridTopo(w, h);
  } else if (type == 'cube3d') {
    return new Cube3dTopo(w, h, d);
  } else if (type == 'cube2d') {
    return new CubeSurfaceTopo(w, h, d);
  }
}

function new_board(topo, minespec) {
  board = new Board(topo);
  board[{'count': 'populate_n', 'prob': 'populate_p'}[minespec.mode]](minespec.k);
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

function GameSession(board, canvas, first_safe) {
  this.board = board;
  this.canvas = canvas;
  this.first_safe = first_safe;

  this.start = function() {
    this.seq = next_seq();
    this.status = 'in_play';
    this.total_risk = 0.;
    this.first_move = true;
    this.solution = null;
    // used for display purposes but not for logic, for when real solution is being recomputed
    this.display_solution = null;

    //note: a board that is all mines is 'solved' from the very start (in non-strict mode), however,
    //we won't check for this until the user takes some action, because the degenerate-case solution
    //is interesting to present

    if (this.first_safety()) {
      this.solve_first_safe();
    } else {
      this.solve();
    }
    this.refresh();

    push_state();
  };

  this.refresh = function() {
    this.update_info();
    this.render();
    TOOLTIP_UPDATE();
  }

  this.solve = function() {
    var game = this;
    var seq = this.seq;

    set_spinner('solving');

    solve_query(this.board, SOLVER_URL, function (solution, proc_time) {
        // make sure the game state this solution is for is still the current one
        if (GAME == game && seq == game.seq) {
          set_spinner(proc_time == null ? 'timeout' : proc_time);

          game.set_solution(solution);
          game.refresh();
        }
        SOLUTIONS[seq] = solution;
      });
  }

  this.set_solution = function(solution) {
    if (solution) {
      solution.process(this.board);
    }
    this.solution = solution;
    this.display_solution = solution;
  }

  this.render = function() {
    var params = {
      show_mines: this.show_mines() && !this.first_safety(),
    };

    this.board.render(this.canvas, params);
    if (this.show_solution()) {
      this.display_solution.render(this.canvas);
    }
  }

  this.manual_move = function(pos, type) {
    if (!get_setting('play_manual')) {
      return;
    }

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
    if (!get_setting('play_auto')) {
      return;
    }

    var game = this;
    var solu = this.solution;
    this.action(function(uncovered) {
        var action = false; 
        var survived = true;

        // we don't add known safe cells to uncovered for efficiency,
        // but update_risk could handle it if we did

        if (game.first_safety()) {
          game.board.uncover(game.board.safe_cell());
          action = true;
        } else if (solu) {
          var guess = null;
          if (solu.best_guesses.length) {
            var guess = choose_rand(solu.best_guesses);
          }

          solu.apply(function (pos, cell, prob, board) {
              if (prob < EPSILON) {
                board.flag(pos, false);
                board.uncover(pos);
                action = true;
              } else if (prob > 1. - EPSILON) {
                board.flag(pos);
              } else if (cell.name == guess) {
                survived = board.uncover(pos);
                uncovered.push(pos);
                action = true;
              }
            });
        }

        return (action ? survived : null);
      });
  }

  this.action = function(move) {
    if (this.status != 'in_play') {
      return;
    }

    var uncovered_cells = [];
    var result = move(uncovered_cells);

    var changed = (result != null);
    var survived = (result || !changed);

    if (!survived) {
      this.status = 'fail';
    } else if ((changed || this.first_move) && this.board.is_complete()) {
      // must check when 'first move' because we don't check for all-mine boards on session init
      this.status = 'win';
    }

    if (changed) {
      this.update_risk(uncovered_cells);

      this.seq = next_seq();
      this.solution = null;
      this.first_move = false;
      push_state();
    }

    this.refresh();
    if (this.status == 'in_play' && changed) {
      this.solve();
    } else if (this.status != 'in_play') {
      set_spinner(null);
    }
  }

  this.update_risk = function(cells_played) {
    if (this.total_risk == null) {
      // risk already unknown
      return;
    }

    var prob = 0.;
    var solu = this.solution;
    var uncertain = [];
    $.each(cells_played, function(i, pos) {
        var p = (solu ? solu.get_prob(pos, true) : null); //!!
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

  this.update_info = function() {
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

  this.game_mode = function() {
    return (this.board.mine_prob ? 'prob' : 'count');
  }

  this.show_mines = function() {
    return get_setting('show_mines') || this.status != 'in_play';
  }

  this.show_solution = function() {
    return get_setting('show_sol') && this.display_solution && this.status == 'in_play';
  }

  this.first_safety = function() {
    if (this.board_full == null) {
      var board_full = (this.board.mine_counts().total == this.board.num_cells());
    }

    return (this.first_safe && this.first_move && !board_full);
  }

  this.solve_first_safe = function() {
    set_spinner(null);
    var sol = new Solution({_other: 0.});
    this.set_solution(sol);
    SOLUTIONS[this.seq] = sol;
  }

  this.mouse_cell = function(e) {
    var coord = mousePos(e, this.canvas);
    return this.board.cell_from_xy(coord, this.canvas);
  }

  this.snapshot = function() {
    return {
      seq: this.seq,
      risk: this.total_risk,
      first: this.first_move,
      board_state: this.board.snapshot(),
    };
  }

  this.restore = function(snapshot) {
    this.seq = snapshot.seq;
    this.status = 'in_play';
    this.total_risk = snapshot.risk;
    this.first_move = snapshot.first;
    this.board.restore(snapshot.board_state);
    this.set_solution(SOLUTIONS[this.seq]);

    this.refresh();
  }
}

function solve_query(board, url, callback) {
  $.post(url, JSON.stringify(board.game_state()), function (data) {
      if (data.error) {
        callback(null, null);
      } else {
        callback(new Solution(data.solution), data.processing_time);
      }
    }, "json");
}

var SOLUTIONS = {};

function Solution(probs) {
  this.cell_probs = probs;
  this.best_guesses = null;
  this.board = null;

  this.apply = function(func) {
    var names = [];
    for (var name in this.cell_probs) {
      names.push(name);
    }
    var solu = this;
    this.board.for_each_name(names, function (pos, cell, board) {
        func(pos, cell, solu.cell_probs[cell.name], board);
      });
    
    var other_prob = this.cell_probs['_other'];
    if (other_prob != null) {
      this.board.for_each_cell(function (pos, cell, board) {
          if (!cell.visible && names.indexOf(cell.name) == -1) {
            func(pos, cell, other_prob, board);
          }
        });
    }
  }

  this.get_prob = function(pos, ignorevis) {
    var prob = null;
    var cell = this.board.get_cell(pos);
    prob = this.cell_probs[cell.name];
    if (prob == null && (ignorevis || !cell.visible)) { //ignorevis can go away when we cache 'other' cells
      prob = this.cell_probs['_other'];
    }
    return prob;
  }

  this.process = function(board) {
    this.board = board;

    var must_guess = true;
    var guesses = [];
    var min_prob = 1.;
    this.apply(function (pos, cell, prob, board) {
        if (prob < EPSILON) {
          must_guess = false;
        } else if (prob < 1. - EPSILON) {
          guesses.push({name: cell.name, p: prob});
          min_prob = Math.min(min_prob, prob);
        }
      });

    this.best_guesses = [];
    if (must_guess) {
      var solu = this;
      $.each(guesses, function(i, guess) {
          if (guess.p < min_prob + EPSILON) {
            solu.best_guesses.push(guess.name);
          }
        });
    }
  }

  this.render = function(canvas) {
    var solu = this;
    this.apply(function (pos, cell, prob, board) {
        // still render overlay for cells erroneously flagged, or cells correctly flagged
        // but we shouldn't know that yet (p != 1.)
        if (!(cell.flagged && cell.state == 'mine') || prob < 1.) {
          solu.board.render_overlay(pos, canvas, prob_shade(prob, solu.best_guesses.indexOf(cell.name) != -1), cell.flagged && prob < 1.);
        }
      });
  }
}

function init_canvas() {
  UI_CANVAS = $('#canvas_stack canvas').filter(':last');
}

function mousePos(evt, elem) {
  return {x: evt.layerX - elem.offsetLeft, y: evt.layerY - elem.offsetTop};
}

function hover_overlays(e) {
  if (e) {
    var xy = {x: e.pageX, y: e.pageY};
    var pos = GAME.mouse_cell(e);
  } else {
    var xy = null;
    var pos = null;
  }
  neighbor_overlay(pos);
  TOOLTIP_UPDATE = function() {
    prob_tooltip(pos, xy);
  };
  TOOLTIP_UPDATE();
}

var TOOLTIP_UPDATE = function(){};
var cellname_in_tooltip = false;
function prob_tooltip(pos, mousePos) {
  var show = false;
  if (pos && GAME.show_solution()) {
    var prob = GAME.display_solution.get_prob(pos);
    show = (prob > EPSILON && prob < 1. - EPSILON);
  }

  if (cellname_in_tooltip && pos) {
    show = true;
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
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!get_setting('highlighting')) {
    return;
  }
  if (!pos) {
    return;
  }

  var cur_cell = GAME.board.get_cell(pos);
  if (!cur_cell.visible || cur_cell.state != 0) {
    GAME.board.render_overlay(pos, canvas, HIGHLIGHT_CUR_CELL);
  }
  GAME.board.for_each_neighbor(pos, function (pos, neighb, board) {
      if (!neighb.visible) {
        board.render_overlay(pos, canvas, HIGHLIGHT_NEIGHBOR);
      }
    });
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
    GAME.refresh();
  }
}

function fmt_pct(x) {
  return (100. * x).toFixed(2) + '%'
}

SEQ = 0;
function next_seq() {
  SEQ++;
  return SEQ;
}

function set_spinner(state) {
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
      var s_time = (+state).toFixed(3) + 's';
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

function extend(arr1, arr2) {
  arr1.push.apply(arr1, arr2);
}