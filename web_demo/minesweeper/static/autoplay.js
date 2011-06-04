

$(document).ready(function() {
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
    
    $('#make').click(function(e) {
        make_board();
        e.preventDefault();
      });

    selectChoice($('input[name="topo"][value="grid"]'));
  });

function selectChoice(elem) {
  elem.attr('checked', true);
  elem.trigger('change');
}

function make_board() {
  var topo_type = $('input[name="topo"]:checked').val();
  var width = +$('#width').val();
  var height = +$('#height').val();
  var depth = +$('#depth').val();
  var minespec = +$('#mines').val();
  var first_safe = $('#first_safe').attr("checked");

  console.log('making');
}

function mousePos(evt, elem) {
  return {x: evt.pageX - elem.offsetLeft, y: evt.pageY - elem.offsetTop};
}




function apply(board, cell_probs, func) {
  var names = [];
  for (var name in cell_probs) {
    names.push(name);
  }
  board.for_each_name(names, function (r, c, cell, board) {
      func(r, c, cell, cell_probs[cell.name], board);
    });
  
  var other_prob = cell_probs['_other'];
  if (other_prob != null) {
    board.for_each_cell(function (r, c, cell, board) {
        if (!cell.visible && names.indexOf(cell.name) == -1) {
          func(r, c, cell, other_prob, board);
        }
      });
  }
}

function render_overlays (board, cell_probs, canvas) {
  apply(board, cell_probs, function (r, c, cell, prob, board) {
      if (!cell.flagged) {
        board.render_overlay(r, c, prob_shade(prob), canvas);
      }
    });
}

/*
function make_board (w, h, mine_factor, mine_mode) {
  mine_mode = mine_mode || (mine_factor >= 1. ? 'count' : 'prob');

  board = new Board(w, h);
  board[{'count': 'populate_n', 'prob': 'populate_p'}[mine_mode]](mine_factor);
  return board;
}
*/

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
  apply(board, cell_probs, function (r, c, cell, prob, board) {
      if (prob < EPSILON) {
        board.uncover(r, c);
        must_guess = false;
      } else if (prob > 1. - EPSILON) {
        if (!cell.flagged && board.num_mines) {
          remaining_mines--;
        }
        board.flag(r, c);
      } else {
        guesses.push({r: r, c: c, p: prob});
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
      // only occurs at the very end when all there is left to do is flag remaining mines
      shuffle(best_guesses);
      var guess = best_guesses[0];
      survived = board.uncover(guess.r, guess.c);
      total_risk = 1. - (1. - total_risk) * (1. - min_prob);
    }
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

/*
$(document).ready(function(){
    //  netscape.security.PrivilegeManager.enablePrivilege("UniversalBrowserRead");

    canvas = $('#gameboard')[0];

    board = make_board(30, 16, 50);
    board.render(canvas);

    remaining_mines = board.num_mines || '??';
    total_risk = 0.;

    solve(board, SOLVE_URL, function (data, board) { display_solution(data, board, canvas); });

    $('#go').click(function () { go(board, canvas); });

    $("#tooltip").hide();
    $("#gameboard").mousemove(function(e){
        var coord = mousePos(e, canvas);
        var pos = board.cell_from_xy(coord, canvas);

        var prob = null;
        if (pos) {
          var cell = board.get_cell(pos.r, pos.c);
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
          $('#tooltip').text((100. * prob).toFixed(2) + '%');
        } else {
          $('#tooltip').hide();
        }
      });
    $("#gameboard").mouseout(function(e){
        $("#tooltip").hide();
      });
  });
*/