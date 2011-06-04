
$(document).ready(function() {
    canvas = $('#game_canvas')[0];
    $(window).resize(resize_canvas);
    resize_canvas();

    $('input[name="topo"]').change(function(e) {
        var _3d = ['cube3d'];
        var selected = $(e.target).val();
        if (_3d.indexOf(selected) != -1) {
          $('#depth').show();
          $('#depth_lab').show();       
        } else {
          $('#depth').hide();
          $('#depth_lab').hide();
        }
      });
    
    $('#start').click(function(e) {
        new_game();
        e.preventDefault();
      });

    $('#step').click(function (e) {
        go(board, canvas);
        e.preventDefault();
      });

    $("#tooltip").hide();
    $('#game_canvas').mousemove(prob_tooltip);
    $('#game_canvas').mouseout(function(e){
        $("#tooltip").hide();
      });

    set_defaults();
    new_game();


    remaining_mines = board.num_mines || '??';
    total_risk = 0.;
  });

function set_defaults() {
  selectChoice($('input[name="topo"][value="grid"]'));
  $('#width').val(30);
  $('#height').val(16);
  $('#mines').val(100);
  selectChoice($('#first_safe'));
}

function selectChoice(elem) {
  elem.attr('checked', true);
  elem.trigger('change');
}

function new_game() {
  var topo_type = $('input[name="topo"]:checked').val();
  var width = +$('#width').val();
  var height = +$('#height').val();
  var depth = +$('#depth').val();
  var minespec = +$('#mines').val();
  var first_safe = $('#first_safe').attr("checked");

  var topo = new_topo(topo_type, width, height, depth);
  board = new_board(topo, minespec);
  var game = new_game_session(board, first_safe);

  board.render(canvas);
  solve(board, SOLVE_URL, function (data, board) { display_solution(data, board, canvas); });
}

function new_topo(type, w, h, d) {
  return new GridTopo(w, h);
}

function new_board(topo, mine_factor, mine_mode) {
  mine_mode = mine_mode || (mine_factor >= 1. ? 'count' : 'prob');

  board = new Board(topo);
  board[{'count': 'populate_n', 'prob': 'populate_p'}[mine_mode]](mine_factor);
  return board;
}

function new_game_session(board, first_safe) {

}

function mousePos(evt, elem) {
  return {x: evt.pageX - elem.offsetLeft, y: evt.pageY - elem.offsetTop};
}




function apply(board, cell_probs, func) {
  var names = [];
  for (var name in cell_probs) {
    names.push(name);
  }
  board.for_each_name(names, function (pos, cell, board) {
      func(pos, cell, cell_probs[cell.name], board);
    });
  
  var other_prob = cell_probs['_other'];
  if (other_prob != null) {
    board.for_each_cell(function (pos, cell, board) {
        if (!cell.visible && names.indexOf(cell.name) == -1) {
          func(pos, cell, other_prob, board);
        }
      });
  }
}

function render_overlays (board, cell_probs, canvas) {
  apply(board, cell_probs, function (pos, cell, prob, board) {
      if (!cell.flagged) {
        board.render_overlay(pos, prob_shade(prob), canvas);
      }
    });
}


function solve(board, url, callback) {
  $.post(url, JSON.stringify(board.game_state()), function (data) {
      var solution = data.solution;
      if (solution['_other'] == null && board.mine_prob != null) {
        solution['_other'] = board.mine_prob;
      }
      
      callback(solution, board);
    }, "json");
}

function display_solution(cell_probs, board, canvas) {
  render_overlays(board, cell_probs, canvas);
  current_probs = cell_probs;
}

function action(board, cell_probs, canvas) {
  var must_guess = true;
  var guesses = [];
  var min_prob = 1.;
  var survived = true;
  apply(board, cell_probs, function (pos, cell, prob, board) {
      if (prob < EPSILON) {
        board.uncover(pos);
        must_guess = false;
      } else if (prob > 1. - EPSILON) {
        if (!cell.flagged && board.num_mines) {
          remaining_mines--;
        }
        board.flag(pos);
      } else {
        guesses.push({pos: pos, p: prob});
        min_prob = Math.min(min_prob, prob);
      }
    });
  if (must_guess) {
    var best_guesses = [];
    for (var i = 0; i < guesses.length; i++) {
      if (guesses[i].p < min_prob + EPSILON) {
        best_guesses.push(guesses[i]);
      }
    }
    if (best_guesses.length) {
      var guess = choose_rand(best_guesses);
      survived = board.uncover(guess.pos);
      total_risk = 1. - (1. - total_risk) * (1. - min_prob);
    } // else only occurs at the very end when all there is left to do is flag remaining mines
  }
  board.render(canvas);
  return survived;
}

function update_stats() {
  $('#num_mines').text(remaining_mines);
  $('#risk').text((100. * total_risk).toFixed(2) + '%');
}

function go(board, canvas) {
  var survived = action(board, current_probs, canvas);
  update_stats();
  if (survived) {
    solve(board, SOLVE_URL, function (data, board) { display_solution(data, board, canvas); });
  }
}

SOLVE_URL = '/api/minesweeper_solve/';


function prob_tooltip(e) {
  var coord = mousePos(e, canvas);
  var pos = board.cell_from_xy(coord, canvas);

  var prob = null;
  if (pos) {
    var cell = board.get_cell(pos);
    prob = current_probs[cell.name];
    if (prob == null && !cell.visible && !cell.flagged) {
      prob = current_probs['_other'];
    }
  }
  if (prob > EPSILON && prob < 1. - EPSILON) {
    $("#tooltip").show();
    $("#tooltip").css({
        top: (e.pageY - 15) + "px",
        left: (e.pageX + 15) + "px"
      });
    $('#tooltip').text(fmt_pct(prob));
  } else {
    $('#tooltip').hide();
  }
}

function resize_canvas() {
  canvas.width = Math.max(window.innerWidth - 30, 400);
  canvas.height = Math.max(window.innerHeight - 300, 300);
  // re-render
}

function fmt_pct(x) {
  return (100. * x).toFixed(2) + '%'
}