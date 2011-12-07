
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
    $('#solving').hide();
    $('#solved').hide();

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

  GAME.start();
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
  console.log('not yet');
}

function GameSession(board, canvas, first_safe) {
  this.board = board;
  this.canvas = canvas;
  this.first_safe = false; //first_safe;

  this.start = function() {
    this.total_risk = 0.;
    this.first_move = true;
    this.status = 'in_play';
    this.solution = null;

    this.refresh();
    this.solve();
  };

  this.refresh = function(redraw_only) {
    if (!redraw_only) {
      this.update_info();
    }
    this.render();
    TOOLTIP_UPDATE();
  }

  this.solve = function() {
    var game = this;
    solve_query(this.board, SOLVER_URL, function (solution) {
        //if (first) {
        //  self.prepare_first_move();
        //}
        game.solution = solution;
        game.refresh(true);
      });
  }

  this.render = function() {
    var params = {
      show_mines: this.show_mines(),
    };

    this.board.render(this.canvas, params);
    if (this.show_solution()) {
      this.solution.render(this.canvas);
    }
  }

  this.manual_move = function(pos, type) {
    if (!get_setting('play_manual')) {
      return;
    }

    var game = this;
    this.action(function() {
        if (type == 'sweep') {
          return game.board.uncover(pos);
        } else if (type == 'sweep-all') {
          return game.board.uncover_neighbors(pos);
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

    var solu = this.solution;
    this.action(function() {
        if (solu) {
          var survived = true;
          var action = false; //necessary to keep track of this?

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
                action = true;
              }
            });
          return (action ? survived : null);
        } else {
          return null;
        }
      });
  }

  this.action = function(move) {
    if (this.status != 'in_play') {
      return;
    }

    var result = move();

    var changed = (result != null);
    var survived = (result || !changed);

    if (!survived) {
      this.status = 'fail';
    } else if (this.board.is_complete()) {
      this.status = 'win';
    }

    //TODO: self.total_risk = 1. - (1. - self.total_risk) * (1. - prob);

    //this.first_move = false;
    this.refresh();
    if (this.status == 'in_play' && changed) {
      this.solve();
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

    $('#risk').text(fmt_pct(this.total_risk));

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
    return get_setting('show_sol') && this.solution && this.status == 'in_play';
  }

  this.mouse_cell = function(e) {
    var coord = mousePos(e, this.canvas);
    return this.board.cell_from_xy(coord, this.canvas);
  }
}

function solve_query(board, url, callback) {
  $('#solving').show();
  $('#solved').hide();
  
  $.post(url, JSON.stringify(board.game_state()), function (data) {
      $('#solving').hide();
      $('#solved').show();

      if (data.error) {
        var sol = null;
        var s_time = '<span style="font-size: 32px; line-height: 32px;">\u2620</span>';
        alert('sorry, an error occurred [' + data.error + ']; please start a new game');
      } else {
        var sol = new Solution(data.solution, board);
        var s_time = data.processing_time.toFixed(3) + 's';
      }
      
      $('#solve_time').html(s_time);
      callback(sol);
    }, "json");
}

function Solution(data, board) {
  this.board = board;
  this.cell_probs = null;
  this.best_guesses = null;

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

  this.process_probs = function(probs) {
    this.cell_probs = probs;

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

  this.process_probs(data);
}


  


/*
function GameSession (board, canvas, first_safe) {
  this.start = function() {

    this.solve(SOLVER_URL, true);
  };

  this.prepare_first_move = function() {
    if (this.first_safe) {
      var safe = this.board.safe_cell();
      this.cell_probs[this.board.get_cell(safe).name] = 0.;
      this.best_guesses = [];
    }
  }

  this.solve = function(url, first) {
    var self = this;
    this.solve_query(url, function (data, board) {
        self.process_probs(data);
        if (first) {
          self.prepare_first_move();
        }
        self.render();
      });
  }

}
*/




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
    var prob = null;
    var cell = GAME.board.get_cell(pos);
    prob = GAME.solution.cell_probs[cell.name];
    if (prob == null && !cell.visible) {
      prob = GAME.solution.cell_probs['_other'];
    }

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
