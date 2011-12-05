
$(document).ready(function() {
    $(window).resize(resize_canvas);
    resize_canvas();

    $('input[name="topo"]').change(topoChanged);
    
    $('#start').click(function(e) {
        new_game();
        return false;
      });

    $('#step').click(function (e) {
        GAME.best_move();
        return false;
      });

    $('#game_canvas').bind('mouseup', function(e) {
        manual_move(e);
        return false;
      });
    $('#game_canvas').bind('contextmenu', function(e) {
        return false;
      });

    $("#tooltip").hide();
    $('#game_canvas').mousemove(prob_tooltip);
    $('#game_canvas').mouseout(function(e){
        $("#tooltip").hide();
      });
    $('#win').hide();
    $('#fail').hide();
    $('#solving').hide();
    $('#solved').hide();

    shortcut.add('enter', function() { GAME.move(); });
    shortcut.add('ctrl+enter', new_game);

    set_defaults();
    new_game();
  });

function set_defaults() {
  cached_dimensions = {_2d: [30, 16, null, 100], _3d: [6, 10, 8, 80]};
  active_dimension = null;

  selectChoice($('input[name="topo"][value="grid"]'));
  selectChoice($('#first_safe'));
  //  selectChoice($('input[name="play"][value="auto"]'));
  selectChoice($('#show_mines'));
  selectChoice($('#show_sol'));
}

function selectChoice(elem) {
  elem.attr('checked', true);
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
  var first_safe = $('#first_safe').attr("checked");

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
  /*
  var play_mode = $('input[name="play"]:checked').val();
  if (play_mode != 'manual') {
    return;
  }
  */

  var coord = mousePos(e, GAME.canvas);
  var pos = GAME.board.cell_from_xy(coord, GAME.canvas);
  if (!pos) {
    return;
  }

  GAME.manual_move(pos, {1: 'sweep', 2: 'sweep-all', 3: 'mark-toggle'}[e.which]);
}

function show_mines_mode() {
  return $('#show_mines').attr("checked");
}

function GameSession(board, canvas, first_safe) {
  this.board = board;
  this.canvas = canvas;
  this.first_safe = false; //first_safe;

  this.start = function() {
    this.total_risk = 0.;
    this.first_move = true;
    this.status = 'in_play';

    this.render();
    this.update_info();
  };

  this.render = function() {
    var show_mines = (show_mines_mode() || this.status != 'in_play');
    var params = {
      show_mines: show_mines,
    };

    this.board.render(this.canvas, params);
    if (this.status == 'in_play') {
      //      this.render_overlays();
    }
  }

  this.manual_move = function(pos, type) {
    if (this.status != 'in_play') {
      return;
    }

    if (type == 'sweep') {
      var result = this.board.uncover(pos);
    } else if (type == 'sweep-all') {
      var result = this.board.uncover_neighbors(pos);
    } else if (type == 'mark-toggle') {
      this.board.flag(pos, 'toggle');
      var result = null;
    }

    var survived = (result != true);
    var changed = (result != null);

    if (!survived) {
      this.status = 'fail';
    } else if (this.board.is_complete()) {
      this.status = 'win';
    }

    //    this.first_move = false;
    this.update_info();
    this.render();
  }

  this.update_info = function() {
    var mi = this.board.mine_counts();
    var mines_remaining = mi.total - (mi.flagged + mi.flag_error);
    if (this.status == 'win') {
      var $mines = 0 + (this.game_mode() == 'prob' ? '/' + mi.total : '');
    } else {
      if (this.game_mode() == 'count') {
        var $mines = $('<div><span id="nmines">' + mines_remaining + '</span></div>');
      } else {
        var $mines = $('<div>??' + (show_mines_mode() ? ' <span id="nmines">(' + mines_remaining + ')</span>' : '') + '</div>');
      }
      if (show_mines_mode() ? mi.flag_error > 0 : mines_remaining < 0) {
        $mines.find('#nmines').css('color', 'red');
      }
    }
    $('#num_mines').html($mines);

    $('#risk').text(fmt_pct(this.total_risk));

    $('#win')[this.status == 'win' ? 'show' : 'hide']();
    $('#fail')[this.status == 'fail' ? 'show' : 'hide']();
  }

  this.game_mode = function() {
    return (this.board.mine_prob ? 'prob' : 'count');
  }
}

/*
function GameSession (board, canvas, first_safe) {
  this.board = board;
  this.canvas = canvas;
  this.first_safe = false; //first_safe;

  this.start = function() {
    this.remaining_mines = this.board.num_mines;
    this.total_risk = 0.;
    this.first_move = true;
    this.status = 'in_play';

    this.render();
    this.update_info();
    this.solve(SOLVER_URL, true);
  };

  this.prepare_first_move = function() {
    if (this.first_safe) {
      var safe = this.board.safe_cell();
      this.cell_probs[this.board.get_cell(safe).name] = 0.;
      this.best_guesses = [];
    }
  }

  this.move = function() {
    if (this.status != 'in_play') {
      return;
    }
    //check if move in progress

    this.action();
    if (this.status == 'in_play') {
      this.solve(SOLVER_URL);
    }
  }

  this.render = function() {
    this.board.render(this.canvas);
    if (this.status == 'in_play') {
      this.render_overlays();
    }
  }

  this.render_overlays = function() {
    var self = this;
    this.apply(function (pos, cell, prob, board) {
        if (!cell.flagged) {
          board.render_overlay(pos, prob_shade(prob, self.best_guesses.indexOf(cell.name) != -1), self.canvas);
        }
      });
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

  this.solve_query = function(url, callback) {
    var self = this;

    $('#solving').show();
    $('#solved').hide();

    $.post(url, JSON.stringify(this.board.game_state()), function (data) {
        if (data.error) {
          alert('sorry, an error occurred [' + data.error + ']; please start a new game');
          return;
        }

        $('#solving').hide();
        $('#solved').show();
        $('#solve_time').text(data.processing_time.toFixed(3) + 's');

        var solution = data.solution;

        callback(solution);
      }, "json");
  }

  this.action = function() {
    var survived = true;

    var guess = null;
    if (this.best_guesses.length) {
      var guess = choose_rand(this.best_guesses);
    }

    var self = this;
    this.apply(function (pos, cell, prob, board) {
        if (prob < EPSILON) {
          board.uncover(pos);
        } else if (prob > 1. - EPSILON) {
          if (!cell.flagged && board.num_mines) {
            self.remaining_mines--;
          }
          board.flag(pos);
        } else if (cell.name == guess) {
          survived = this.board.uncover(pos);
          self.total_risk = 1. - (1. - self.total_risk) * (1. - prob);
        }
      });

    if (!survived) {
      this.status = 'fail';
    } else if (this.board.is_complete()) {
      this.status = 'win';
    }

    this.first_move = false;
    this.update_info();
    this.render();
  }

  this.update_info = function() {
    $('#num_mines').text(this.remaining_mines != null ? this.remaining_mines : '??');
    $('#risk').text(fmt_pct(this.total_risk));

    $('#win')[this.status == 'win' ? 'show' : 'hide']();
    $('#fail')[this.status == 'fail' ? 'show' : 'hide']();
  }


  //re-size

  //xy => cell
}
*/

function Solution() {
  this.cell_probs = [];
  this.best_guesses = [];

  this.apply = function(func) {
    var names = [];
    for (var name in this.cell_probs) {
      names.push(name);
    }
    var self = this;
    this.board.for_each_name(names, function (pos, cell, board) {
        func(pos, cell, self.cell_probs[cell.name], board);
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
    var self = this;
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
      for (var i = 0; i < guesses.length; i++) {
        if (guesses[i].p < min_prob + EPSILON) {
          this.best_guesses.push(guesses[i].name);
        }
      }
    }
  }


}









function mousePos(evt, elem) {
  return {x: evt.pageX - elem.offsetLeft, y: evt.pageY - elem.offsetTop};
}

var cellname_in_tooltip = false;
function prob_tooltip(e) {
  //debug
  return;

  var coord = mousePos(e, GAME.canvas);
  var pos = GAME.board.cell_from_xy(coord, GAME.canvas);

  var show = false;
  if (pos) {
    var cell = GAME.board.get_cell(pos);
    var prob = GAME.cell_probs[cell.name];
    if (prob == null) {
      if (cell.visible) {
        prob = 0.;
      } else if (cell.flagged) {
        prob = 1.;
      } else {
        prob = GAME.cell_probs['_other'];
      }
    }

    show = (cellname_in_tooltip || (prob > EPSILON && prob < 1. - EPSILON));
  }
  if (show) {
    $("#tooltip").show();
    $("#tooltip").css({
        top: (e.pageY - 15) + "px",
        left: (e.pageX + 15) + "px"
      });
    $('#tooltip').text((cellname_in_tooltip ? cell.name + ' :: ' : '') + fmt_pct(prob));
  } else {
    $('#tooltip').hide();
  }
}

function resize_canvas() {
  var canvas = $('#game_canvas')[0];
  canvas.width = Math.max(window.innerWidth - 30, 400);
  canvas.height = Math.max(window.innerHeight - 250, 300);
  // re-render
}

function fmt_pct(x) {
  return (100. * x).toFixed(2) + '%'
}
