function replaceAll(string, search, replace) {
  return string.split(search).join(replace);
}

function getDatum(value) {
  let datum_regex = /\[.*]\s*[\.;]/;
  let datum;

  let hard_coded_syntax_match = value.match(datum_regex);
  let generator_synax_split = value.split(datum_regex);
  if ( hard_coded_syntax_match ) {
    datum = hard_coded_syntax_match[0].slice(0,-1);
  }
  else if ( generator_synax_split ) {
    datum = generator_synax_split[0];
  }
  else {
    throw `Could not parse datum: ${value}`;
  }
  if ( codeIsFunction(datum) ) {
    datum = eval(datum)[0];
  }
  else {
    datum = datum.trim();
    datum = replaceAll(datum, ' ]', ']');
    datum = replaceAll(datum, ' ', ',');
    datum = replaceAll(datum, ' [', '[');
    datum = replaceAll(datum, ',,', ',');
    datum = JSON.parse(datum);
  }
  return datum;
}

function codeIsFunction(code) {
  let function_regex = /.*\(.*\)]/;
  if ( code.match(function_regex) ) {
    return true;
  }
  return false;
}

function removeTabsAndNewlines(user_input) {
  // remove tabs, newlines, and multiple spaces. convert any single quotes to double quotes
  user_input = user_input.replace(/\s\s+/g, '');
  user_input = user_input.replaceAll('\'', '"');
  user_input = user_input.replaceAll(';', ';\n');
  return user_input.replace(/(\r\n|\n|\r)/gm, "").replace(/ +(?= )/g,'');
}

function getDestination(code) {
  let every_n_regex = /every\(.*\)\s*/;
  code = code.trim();
  let contains_every_n_statement = code.match(every_n_regex);
  if ( contains_every_n_statement ) {
    // if there is an every() statement, destination is after that
    code = code.substring(code.indexOf(')') + 1).trim();
  }
  // split on whitespace
  return code.split(/\s+/)[0];
}

function getProperty(code, destination) {
  // property is the string after the destination string and before the datum
  let dest_index = code.indexOf(destination);
  code = code.replace(destination, '').trim();
  code = code.substring(dest_index, code.length);
  code = code.split('[')[0].trim();
  return code;
}

function getStatement(code, property) {
  let statement_regex = /\[.*]*/s;
  return code.match(statement_regex)[0];
}

function parseStringOfOperations(value) {
  // everything after the period following the datum.
  // basically all the operations in string form. if no operations, returns empty string
  let post_datum_regex = /]\s*\..*[^;]/;
  let ops = value.match(post_datum_regex);
  if ( ops ) {
    return ops[0].slice(2);
  }
  else {
    return '';
  }
}

function splitArguments(str) {
  let result = [], item = '', depth = 0;
  function arg_push() { if (item) result.push(item); item = ''; }
  for (let i = 0, c; c = str[i], i < str.length; i++) {
    if (!depth && c === '.') arg_push();
    else {
      item += c;
      if (c === '(') depth++;
      if (c === ')') depth--;
    }
  }
  arg_push();
  return result;
}

function parseOperations(value) {
  let operations = [];
  // split the string of operations into an array, loop through
  // value = value.replaceAll('"', '');
  let split_ops = splitArguments(value);
  for (const [k, d] of Object.entries(split_ops)) {
    let op = d.split('(')[0];
    let args = d.substring(
        // args is everything from the first to the last parenthesis
        d.indexOf("(") + 1,
        d.lastIndexOf(")"),
    );
    if ( !args.includes('(') && !args.includes(')') && !args.includes(',') ) {
        // if there are no functions aka parenthesis in the middle of the string,
      if ( typeof args == 'string' && args.length > 0 ) {
          // and global variable found - eval it
          args = eval(args);
      }
      // otherwise no need to eval any code -- simply push the pre-existing value into args
      operations.push({
        'op': op,
        'args': args
      });
    }
    else {
      try {
        // there is a function somewhere in the argument, so now we'll
        // attempt to eval the code, accounting for a few ways it could be structured
        let split_args = [];
        let multiple_functions_regex = /(?<=\)\,)/;
        let multi_function_args = args.split(multiple_functions_regex);
        let multiple_arguments_regex = /,(?![^()]*(?:\([^()]*\))?\))/;
        let multi_args = args.split(multiple_arguments_regex);
        let args_array = [];
        if ( multi_function_args.length > 1 ) {
          // case: multiple functions as arguments
          args_array = multi_function_args;
        }
        else if ( multi_args.length > 1 ) {
          // case: multiple arguments, at least one function as argument
          args_array = multi_args;
        }
        else {
          // case: function as only argument, just initialize the args array to that
          args_array = [args];
        }

        // however many arguments are now split into an array. loop through
        // them, eval them, and create a csv string of the evaled arguments
        let args_str = '';
        for (const [y, r] of Object.entries(args_array)) {
          // prevent any straggling trailing parens
          let valid_parsed_arg = r.replace('),',')');
          let evaled_arg = eval(valid_parsed_arg);
          args_str += `${evaled_arg.toFixed(4)},`;
        }
        // remove last comma
        args_str = args_str.slice(0,-1);
        operations.push({
          'op': op,
          'args': args_str
        });
      } catch (er) {
        try {
          // case: with functions like am() or interlace(), which can take a generator as input,
          // it's also possible for an argument to be an entirely self-contained
          // statement, e.g:
          // [sine(1,100)]
          // *** here's what I mean ****
          // .am(sine(4,10).gain(random(0,1,0)));
          // **** end example ****
          // in that case, rerun the processCode() function (  recursively :D   )
          // insert a '[' at the beginning, and a ']' after the first instance of ').'
          // basically creates the structure needed to parse: [generator(2,3,3.5)].foo(1,2);
          let datum_from_args, processed_code_fom_args;
          let arg_has_operations = /\).*\./;
          if ( args.match(arg_has_operations) ) {
            // case: there are multiple chained operations in the argument
            if ( args.indexOf(').') > 0 ) {
                args = args.replace(').', ')].');
            }
            else {
                args += ']';
            }
            args = '[' + args;
            datum_from_args = getDatum(args);
            processed_code_fom_args = processCode(args, datum_from_args);
            if ( typeof processed_code_fom_args == 'number' ) {
              processed_code_fom_args = `[${c.toString()}]`;
            }
            else {
              for (var i = 0; i < processed_code_fom_args.length; i++) {
                processed_code_fom_args[i] = processed_code_fom_args[i];
              }
              processed_code_fom_args = JSON.stringify(processed_code_fom_args);
            }
          }
          else {
            // case: the initial operation is the only argument
            args = '[' + args + ']';
            processed_code_fom_args = JSON.stringify(getDatum(args));
          }
          operations.push({
            'op': op,
            'args': processed_code_fom_args
          });
        } catch (e) {
          try {
            // case: arguments passed into a "sometimes" function
            // ultimately the argument should look like: [0.5, 'scale(-1,1).gain(0)']
            let sometimes_split_regex = /sometimes|when\s*\(/;
            let sometimes_split = d.split(sometimes_split_regex);
            // remove the trailing ')' from the sometimes command
            let sometimes_args = `${sometimes_split[1].slice(0,sometimes_split[1].length-1)}`;
            sometimes_args = sometimes_args.replaceAll('\'', '"');
            sometimes_args = `[${sometimes_args}]`;
            // TODO: sometimes() does not handle dynamic arguments, like random(). Would require a more significant rewrite
            operations.push({
              'op': op,
              'args': sometimes_args
            });
          } catch (ee) {
            // "Please everybody, if we haven't done what we could have done, we've tried"
            throw `Could not parse argument: ${args}`;
          }
        }
      }
    }
  }
  return operations;
}

function runOperations(operations, datum) {
  for (const [key, op] of Object.entries(operations)) {
    if ( op.op == 'skip' ) {
      return 'SKIP';
    }
    var fn = window[op.op];
    if ( typeof fn === 'function' ) {
      let args = [];
      args.push(datum);
      try {
        args.push(JSON.parse(op.args));
      } catch (e) {
        let args_split = op.args.replaceAll(' ', '').split(',');
        for (var i = 0; i < args_split.length; i++) {
          args.push(args_split[i]);
        }
      }
      datum = fn.apply(null, args);
    }
  }
  // if the array exceeds 1024 values, re-scale it to 1024.
  return reduce(datum, 1024);
}

function getCommands(user_input) {
  return user_input.trim().split(';').filter(Boolean);
}

function createMultConnections(operations, destination, property) {
  let m = {};
  for (const [key, op] of Object.entries(operations)) {
    if ( op.op == 'mult' ) {
      let args = op.args;
      args = args.replaceAll('\'', '').replaceAll('"', '');
      let mult_destinaton = args.split(' ')[0];
      let mult_property = args.split(' ')[1];
      m[mult_destinaton] = {
        from_destination: destination,
        from_property: property,
        to_destination: mult_destinaton,
        to_property: mult_property
      }
    }
  }
  return m;
}

function handleMultConnections(facets, mults) {
  for (const [key, mult] of Object.entries(mults)) {
    if ( !facets[mult.to_destination] ) {
      facets[mult.to_destination] = {};
    }
    facets[mult.to_destination][mult.to_property] = facets[mult.from_destination][mult.from_property];
  }
  return facets;
}

function handleReruns(statement) {
  // any time a .rerun() command is found in the command,
  // get the entire statement up to that point, and rerun it however many times are specified,
  // replacing the .rerun() command with the actual rerun results, via .append(data([]))
  // whereas .dup() takes the result of a command and copies it n times,
  // .rerun() actually reruns the preceding command(s), so if they contain elements of chance,
  // each iteration of .rerun() will be potentially unique.
  let rerun_regex = /.rerun\((.*?)\)/;
  let statment_has_reruns = rerun_regex.test(statement);
  let rerun_datum, remove_last_paren = false;
  if ( statment_has_reruns ) {
    // this code is a bit wonky, but it handles all possibilities of
    // both numbers or commands being the argument of .rerun(), as well as
    // the possibility of commands continuing after .rerun(), or not.
    // . e.g. ".rerun(2);" or ".rerun(random(1,5,1)).gain(3);"
    let rerun_times = statement.split(rerun_regex)[1];
    if ( isNaN(rerun_times) ) {
      remove_last_paren = true;
      rerun_times = rerun_times + ')';
    }
    rerun_times = Math.abs(Math.round(eval(rerun_times)));
    if (rerun_times < 1 ) {
      return statement;
    }
    let rerun_split = statement.split(rerun_regex)[0];
    let i = 0;
    let rerun_out = '';
    while (i < rerun_times) {
      rerun_datum = getDatum(rerun_split);
      rerun_datum = processCode(rerun_split, rerun_datum);
      rerun_out += `.append(data([${rerun_datum.toString()}]))`;
      i++;
    }
    if ( remove_last_paren ) {
      rerun_out = rerun_out.substring(0, rerun_out.lastIndexOf(")"),);
    }
    statement = statement.replace(rerun_regex, rerun_out);
    // recurse until all instances of .rerun() have been replaced
    statement = handleReruns(statement);
  }
  return statement;
}

function initFacetDestination(facets, destination) {
  if ( !facets[destination] ) {
    facets[destination] = {};
  }
  return facets;
}

function facetInit() {
  return {};
}

let facets = facetInit();

function processCode(statement, datum) {
  let ops_string, operations = [];
  ops_string = parseStringOfOperations(statement);
  operations = parseOperations(ops_string);
  datum = runOperations(operations, datum);
  return datum;
}

function facetParse(user_input) {
  let commands = [], destination, property, statement, datum, ops_string,
  operations = [], max_sub_steps, flat_sequence, sequence_msg, mults = {}, current_command;
  // parse user input into individual operations on data.
  // run those operations, scale and flatten the resulting array,
  // and send that data into Max so it can go in a buffer wavetable
  try {
    user_input = stripComments(user_input);
    commands = getCommands(user_input);
    Object.values(commands).forEach(command => {
      current_command = removeTabsAndNewlines(command);
      command = removeTabsAndNewlines(command);
      destination = getDestination(command);
      property = getProperty(command, destination);
      statement = getStatement(command, property);
      statement = handleReruns(statement);
      datum = getDatum(statement);
      datum = processCode(statement, datum);
      if ( datum == 'SKIP' ) {
        // do nothing - don't add the command to the facets object
      }
      else {
        max_sub_steps = getMaximumSubSteps(datum) - 1;
        flat_sequence = reduce(flattenSequence(datum, max_sub_steps), 1024);
        initFacetDestination(facets, destination);
        facets[destination][property] = convertFlatSequenceToMessage(flat_sequence);
        facets = handleMultConnections(facets, mults);
      }
    });
  } catch (e) {
    notification(`${e}, command: ${current_command}`);
  }
  return facets;
}

function convertFlatSequenceToMessage(flat_sequence) {
  let out = '';
  for (var i = 1; i <= flat_sequence.length; i++) {
    if ( isNaN(flat_sequence[i-1]) || !isFinite(flat_sequence[i-1]) ) {
      out += '0';
    }
    else {
      out += parseFloat(flat_sequence[i-1]).toFixed(4);
    }
    if ( i != flat_sequence.length ) {
       out += ' ';
    }
  }
  return out;
}

function flattenSequence(sequence, max_sub_steps) {
  // converts a basic "sequence array" into an isomorphism that can go in a wavetable buffer.
  // if the "sequence array" was [0, 1, [2,4], [1,2,3,4]], the wavetable buffer would be:
  // [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 4, 4, 1, 2, 3, 4]
  let out = [];
  Object.values(sequence).forEach(step => {
    if ( Array.isArray(step) ) {
      let s = flattenSequence(step, max_sub_steps-1);
      for (var i = 0; i < s.length; i++) {
        out.push(s[i]);
      }
    }
    else {
      for (var i = 0; i < Math.pow(2, max_sub_steps); i++) {
        out.push(step);
      }
    }
  });
  return out;
}

// returns the maximum number of sub-steps in a given pattern.
// needed to calculate the resolution of a given row sequence when converting from
// multi-dimensional array to wavetable buffer
function getMaximumSubSteps(sequence) {
  return Array.isArray(sequence) ?
    1 + Math.max(...sequence.map(getMaximumSubSteps)) :
    0;
}
// BEGIN  all modulators

// BEGIN single-number operations
// sequence is not needed as an argument for these in the actual code since it's added implicitly
// in the runOperations functions
function random(min = 0, max = 1, int_mode = 0) {
  // returns number within range
  if ( int_mode != 1 && int_mode != 0 ) {
    throw `int_mode must be 1 or 0 if specified`;
  }
  let num = Math.random() * (Number(max) - Number(min)) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.round(num);
  }
  return num;
}

function choose(list) {
  let shuffled = shuffle(list);
  return shuffled[0];
}
// END single-number operations

// BEGIN pattern operations
// sequence is always first argument, any additional arguments are after
function reverse(sequence) {
  let reversed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      reversed_sequence[((sequence.length - 1) - key)] = reverse(step);
    }
    else {
      reversed_sequence[((sequence.length - 1) - key)] = step;
    }
  }
  return reversed_sequence;
}

function append(sequence1, sequence2) {
  return sequence1.concat(sequence2);
}

function nest(sequence1, sequence2) {
  sequence1[sequence1.length] = sequence2;
  return sequence1;
}

function skip(sequence) {
  return sequence;
}

function changed(sequence) {
  let changed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      changed_sequence[key] = changed(step);
    }
    else {
      if ( key == 0 ) {
        if ( step == sequence[sequence.length - 1]) {
          changed_sequence[key] = 0;
        }
        else {
          changed_sequence[key] = 1;
        }
      }
      else {
        if ( step == sequence[key - 1]) {
          changed_sequence[key] = 0;
        }
        else {
          changed_sequence[key] = 1;
        }
      }
    }
  }
  return changed_sequence;
}

function truncate(sequence, length) {
  if ( Number(length) <= 0 ) {
    return [];
  }
  return sequence.slice(0, Number(length));
}

function palindrome(sequence) {
  return sequence.concat(reverse(sequence));
}

function dup(sequence, num) {
  return Array.from({length: Number(num)}).flatMap(a => sequence);
}

function normalize(sequence) {
  // converts any sequence back into 0-1 range
  let normalized_sequence = [];
  let min = Math.min.apply(Math, sequence);
  let max = Math.max.apply(Math, sequence);
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      normalized_sequence[key] = normalze(step);
    }
    else {
      normalized_sequence[key] = (step - min) / (max - min);
    }
  }
  return normalized_sequence;
}

function echo(sequence, num) {
  num = Math.round(Math.abs(Number(num)));
  let echo_sequence = dup(sequence, num);
  let amplitude = 1;
  let count = 1;
  for (const [key, step] of Object.entries(echo_sequence)) {
    if ( count >= sequence.length ) {
      amplitude *= 0.666;
      count = 0;
    }
    if ( Array.isArray(step) ) {
      echo_sequence[key] = echo(step, num);
    }
    else {
      echo_sequence[key] = amplitude * step;
    }
    count++;
  }
  return echo_sequence;
}

function smooth(sequence) {
  let smoothed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    let k = Number(key);
    if ( Array.isArray(step) ) {
      smoothed_sequence[k] = smooth(step);
    }
    else {
      if ( k > 0 && ( (k + 1) < sequence.length ) ) {
        // all other steps
        smoothed_sequence[k] = (smoothed_sequence[k-1] + sequence[k+1]) / 2;
      }
      else if ( k +1 ==  sequence.length ) {
        // last step loops around to average with first
        smoothed_sequence[k] = (smoothed_sequence[k-1] + sequence[0]) / 2;
      }
      else {
        // first step is static
        smoothed_sequence[k] = step;
      }
    }
  }
  return smoothed_sequence;
}

function curve(sequence, tension = 0.5, segments = 25) {
  // flatten the array to avoid nested arrays
  let curved_sequence = [];
  sequence = flattenSequence(sequence, 0);
  // interlace a 0 for the x axis value of each sequence value
  let points = [];
  for (var i = 0; i < sequence.length; i++) {
    points.push(0);
    points.push(sequence[i]);
  }
  // run the curve function
  let splinePoints = getCurvePoints(points, tension, segments, false);
  // deinterlace the 0s on the x axis
  for (var i = 0; i < splinePoints.length; i++) {
    if (i % 2 == 0 ) {
      continue;
    }
    curved_sequence.push(splinePoints[i]);
  }
  return curved_sequence;
}

function slew(sequence, depth = 25, up_speed = 1, down_speed = 1) {
  let slewed_sequence = [];
  up_speed = clip([Math.abs(Number(up_speed))],0,1)[0];
  down_speed = clip([Math.abs(Number(down_speed))],0,1)[0];
  depth = Math.round(Math.abs(Number(depth)));
  for (const [key, step] of Object.entries(sequence)) {
    let k = Number(key);
    if ( Array.isArray(step) ) {
      slewed_sequence.push(slew(step, depth, up_speed, down_speed));
    }
    else {
        // check if next step up or down
        // if up, run from this step to next step in (up_speed * depth) samples, then hold for rest of depth
        // if down, run from this step to next step in (down_speed * depth) samples, then hold for rest of depth
      if ( !isNaN(sequence[k+1]) ) {
        if ( sequence[k+1] > sequence[k] ) {
          // up
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(up_speed * depth) ) {
              // up slew
              slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[k+1]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(sequence[k+1]);
            }
          }
        }
        else if ( sequence[k+1] < sequence[k] ) {
          // down
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(down_speed * depth) ) {
              // down slew
              slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[k+1]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(sequence[k+1]);
            }
          }
        }
        else {
          // static
          for (var i = 0; i < depth; i++) {
            slewed_sequence.push(sequence[k]);
          }
        }
      }
      else {
        // going back to first val
        if ( sequence[0] > sequence[k] ) {
          // up
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(up_speed * depth) ) {
              // up slew
              slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[0]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(sequence[0]);
            }
          }
        }
        else if ( sequence[0] < sequence[k] ) {
          // down
          for (var i = 0; i < depth; i++) {
            if ( i < Math.round(down_speed * depth) ) {
              // down slew
              slewed_sequence.push(((Number(sequence[k]) * (1-(i/Math.round(up_speed * depth)))) + (Number(sequence[0]) * (i/Math.round(up_speed * depth)))));
            }
            else {
              // hold
              slewed_sequence.push(sequence[0]);
            }
          }
        }
        else {
          // static
          for (var i = 0; i < depth; i++) {
            slewed_sequence.push(sequence[0]);
          }
        }
      }
    }
  }
  return slewed_sequence;
}

function equals(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = equals(step, sequence2[key]);
    }
    else {
      if ( step == sequence2[key] ) {
        sequence1[key] = 1;
      }
      else {
        sequence1[key] = 0;
      }
    }
  }
  return sequence1;
}

function and(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = and(step, sequence2[key]);
    }
    else {
      if ( step != 0 && sequence2[key] != 0 ) {
        sequence1[key] = 1;
      }
      else {
        sequence1[key] = 0;
      }
    }
  }
  return sequence1;
}

function or(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = or(step, sequence2[key]);
    }
    else {
      if ( step != 0 || sequence2[key] != 0 ) {
        sequence1[key] = 1;
      }
      else {
        sequence1[key] = 0;
      }
    }
  }
  return sequence1;
}

function add(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = plus(step, sequence2[key]);
    }
    else {
      sequence1[key] = sequence1[key] + sequence2[key];
    }
  }
  return sequence1;
}

function subtract(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = subtract(step, sequence2[key]);
    }
    else {
      sequence1[key] = sequence1[key] - sequence2[key];
    }
  }
  return sequence1;
}

function times(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = times(step, sequence2[key]);
    }
    else {
      sequence1[key] = sequence1[key] * sequence2[key];
    }
  }
  return sequence1;
}

function divide(sequence1, sequence2) {
  let same_size_arrays = makeArraysTheSameSize(sequence1, sequence2);
  sequence1 = same_size_arrays[0];
  sequence2 = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence1)) {
    if ( Array.isArray(step) ) {
      sequence1[key] = divide(step, sequence2[key]);
    }
    else {
      sequence1[key] = sequence1[key] / sequence2[key];
    }
  }
  return sequence1;
}

function makeArraysTheSameSize(sequence1, sequence2) {
  // first, make both arrays as big as possible in relation to each other while preserving all values & scale
  // so if one array was 100 and the other 250, this would convert them to 200 and 250
  if ( sequence1.length > sequence2.length ) {
    sequence2 = scaleTheArray(sequence2, parseInt(sequence1.length / sequence2.length));
  }
  else if ( sequence2.length > sequence1.length ) {
    sequence1 = scaleTheArray(sequence1, parseInt(sequence2.length / sequence1.length));
  }
  // then reduce the bigger array to smaller one's size
  if ( sequence1.length > sequence2.length ) {
    sequence1 = reduce(sequence1, sequence2.length);
  }
  else if ( sequence2.length > sequence1.length ) {
    sequence2 = reduce(sequence2, sequence1.length);
  }
  return [sequence1, sequence2];
}

function scaleTheArray(arrayToScale, nTimes) {
    nTimes-= 1;
    for (var idx = 0, i = 0, len = arrayToScale.length * nTimes; i < len; i++) {
      var elem = arrayToScale[idx];

      /* Insert the element into (idx + 1) */
      arrayToScale.splice(idx + 1, 0, elem);

      /* Add idx for the next elements */
      if ((i + 1) % nTimes === 0) {
        idx += nTimes + 1;
      }
    }
    return arrayToScale;
}

function flipBelow(sequence, min) {
  min = Number(min);
  let flipped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      flipped_sequence[key] = flipBelow(step, min);
    }
    else {
      if ( step < min ) {
        let amount_below = Math.abs(Number(min) - Number(step));
        flipped_sequence[key] = min + amount_below;
      }
      else {
        flipped_sequence[key] = step;
      }
    }
  }
  return flipped_sequence;
}

function flipAbove(sequence, maximum) {
  maximum = Number(maximum);
  let flipped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      flipped_sequence[key] = flipAbove(step, maximum);
    }
    else {
      if ( step > maximum ) {
        let amount_above = Math.abs(Number(step) - Number(maximum));
        flipped_sequence[key] = maximum - amount_above;
      }
      else {
        flipped_sequence[key] = step;
      }
    }
  }
  return flipped_sequence;
}

function quantize(sequence, resolution) {
  resolution = parseInt(Number(resolution));
  let quantized_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      quantized_sequence[key] = quantize(step, resolution);
    }
    else {
      if ( key % resolution == 0 ) {
        // only pass nonzero steps if the modulo of their key is 0
        quantized_sequence[key] = step;
      }
      else {
        quantized_sequence[key] = 0;
      }
    }
  }
  return quantized_sequence;
}

function interlace(sequence1, sequence2) {
    let interlaced_sequence = [];
    let interlace_every;
    let big_sequence = sequence1, small_sequence = sequence2;
    if ( sequence1.length > sequence2.length ) {
      interlace_every = parseInt(sequence1.length / sequence2.length);
      big_sequence = reduce(sequence1, sequence2.length);
      small_sequence = sequence2;
    }
    else if ( sequence2.length > sequence1.length ) {
      interlace_every = parseInt(sequence2.length / sequence1.length);
      big_sequence = reduce(sequence2, sequence1.length);
      small_sequence = sequence1;
    }
    else if ( sequence2.length == sequence1.length ) {
        interlace_every = 1;
    }
    for (const [key, step] of Object.entries(big_sequence)) {
      interlaced_sequence.push(big_sequence[key]);
      if ( Number(key) % interlace_every == 0 ) {
        if ( isNaN(small_sequence[key]) ) {
          interlaced_sequence.push(0)
        }
        else {
          interlaced_sequence.push(small_sequence[key]);
        }
      }
    }
    return interlaced_sequence;
}

function jam(sequence, prob, amt) {
  amt = Number(amt);
  prob = Number(prob);
  let jammed_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      jammed_sequence[key] = jam(step, prob, amt);
    }
    else {
      if ( step != 0 ) {
        if ( Math.random() < prob) {
          // changed
          let step_distance = Math.random() * amt;
          // half the time make it smaller
          if ( Math.random() < 0.5 ) {
            step_distance *= -1;
          }
          jammed_sequence[key] = Number((Number(step) + Number(step_distance)).toFixed(4));
        }
        else {
          // unchanged
          jammed_sequence[key] = step;
        }
      }
      else {
        // unchanged
        jammed_sequence[key] = step;
      }
    }
  }
  return jammed_sequence;
}

function walk(sequence, prob, amt) {
  // swap some of the locations
  let jammed_sequence = [];
  let x_max = sequence.length - 1;
  amt = Number(amt);
  prob = Number(prob);
  if ( prob < 0 ) {
    prob = 0;
  }
  else if ( prob > 1 ) {
    prob = 1;
  }
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      jammed_sequence[key] = walk(step, prob, amt);
    }
    else {
      if ( Math.random() < prob) {
        // changed
        let step_distance = parseInt((Math.random() * amt).toFixed());
        if ( step_distance < 1 ) {
          step_distance = 1;
        }
        // half the time make it smaller
        if ( Math.random() < 0.5 ) {
          step_distance = step_distance * -1;
        }
        let new_step_location = parseInt(key) + parseInt(step_distance);
        if (new_step_location < 0) {
          new_step_location = x_max - (0 - new_step_location) % (x_max - 0);
        }
        else {
          new_step_location = 0 + (new_step_location - 0) % (x_max - 0);
        }
        jammed_sequence[key] = sequence[new_step_location];
        jammed_sequence[new_step_location] = step;
      }
      else {
        // unchanged
        jammed_sequence[key] = step;
      }
    }
  }
  return jammed_sequence;
}

function recurse(sequence, prob) {
  prob = Number(prob);
  if ( prob < 0 ) {
    prob = 0;
  }
  else if ( prob > 1 ) {
    prob = 1;
  }
  let recursive_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      recursive_sequence[key] = recurse(step, prob);
    }
    else {
      if ( (Math.random() < prob) ) {
        // get two random points in the sequence, and re-insert everything
        // between those two points in this location
        let sub_selection = [];
        let point1 = Math.floor(Math.random() * sequence.length);
        let point2 = Math.floor(Math.random() * sequence.length);
        let points = [point1, point2];
        let sorted_points = points.sort(function(a,b) { return a - b;});
        let i = sorted_points[0];
        while (i <= sorted_points[1] ) {
          sub_selection.push(sequence[i]);
          i++;
        }
        recursive_sequence[key] = sub_selection;
      }
      else {
        recursive_sequence[key] = step;
      }
    }
  }
  return recursive_sequence;
}

function prob(sequence, amt) {
  amt = Number(amt);
  if ( amt < 0 ) {
    amt = 0;
  }
  else if ( amt > 1 ) {
    amt = 1;
  }
  let prob_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      prob_sequence[key] = prob(step, amt);
    }
    else {
      if ( Math.random() < amt ) {
        prob_sequence[key] = step;
      }
      else {
        prob_sequence[key] = 0;
      }
    }
  }
  return prob_sequence;
}

function offset(sequence, amt) {
  amt = Number(amt);
  let offset_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      offset_sequence[key] = offset(step, amt);
    }
    else {
      offset_sequence[key] = Number(step) + Number(amt);
    }
  }
  return offset_sequence;
}

function pong(sequence, min, max) {
  min = Number(min);
  max = Number(max);
  let range = [min, max];
  let sorted_range = range.sort(function(a,b) { return a - b;});
  min = sorted_range[0];
  max = sorted_range[1];
  if ( min == max ) {
    throw `Cannot run pong with equal min and max: ${min}`;
  }
  let pong_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      pong_sequence[key] = pong(step, min, max);
    }
    else {
      let new_step = step;
      let step_is_outside_range = ((step < min) || (step > max));
      while (step_is_outside_range) {
        if ( new_step < min )  {
          new_step = max - Math.abs(new_step - min);
        }
        else if ( new_step > max ) {
          new_step = min + Math.abs(new_step - max);
        }
        step_is_outside_range = ((new_step < min) || (new_step > max));
      }
      pong_sequence[key] = new_step;
    }
  }
  return pong_sequence;
}

function sometimes(sequence, controls) {
  let prob = Math.abs(Number(controls[0]));
  let command = controls[1];
  if ( Math.random() < prob ) {
    operations = parseOperations(command);
    sequence = runOperations(operations, sequence);
  }
  return sequence;
}

function fft(sequence) {
  let fft_sequence = [];
  let next_power_of_2 = nextPowerOf2(sequence.length);
  let power2_sequence = new Array(next_power_of_2);
  for (var i = 0; i < power2_sequence.length; i++) {
    if ( sequence[i] ) {
      power2_sequence[i] = sequence[i];
    }
    else {
      power2_sequence[i] = 0;
    }
  }
  let f = new FFT(next_power_of_2);
  f.realTransform(fft_sequence, power2_sequence);
  return fft_sequence;
}

function nextPowerOf2(n) {
    var count = 0;
    if ( n && ! ( n & ( n - 1 ))) {
      return n;
    }
    while ( n != 0) {
      n >>= 1;
      count += 1;
    }
    return 1 << count;
}

function fracture(sequence, max_chunk_size) {
  let fracture_sequence = [];
  max_chunk_size = Math.round(Math.abs(Number(max_chunk_size)));
  if ( max_chunk_size == 0 ) {
    throw `fracture requires a nonzero maximum chunk size`;
  }
  let new_positions = [];
  let next_chunk = [];
  let i = 0;
  while (i < sequence.length) {
    let chunk_size = random(Math.ceil(Math.random() * max_chunk_size) * 0.5, Math.ceil(Math.random() * max_chunk_size),1);
    let temparray = sequence.slice(i, i + chunk_size);
    i += chunk_size;
    fracture_sequence.push(temparray);
  }
  fracture_sequence = shuffle(fracture_sequence).flat();
  return fracture_sequence;
}

function spiral(length, angle_degrees = 137.5) {
  let spiral_sequence = [], i = 1, angle = 0;
  angle_degrees = Math.abs(Number(angle_degrees));
  length = Math.abs(Number(length));
  while ( i <= length ) {
    angle += angle_degrees;
    if (angle > 359) {
      angle = Math.abs(360 - angle);
    }
    // convert degrees back to radians, and then to a 0. - 1. range
    spiral_sequence.push( (angle * (Math.PI/180) ) / (Math.PI * 2) );
    i++;
  }
  return spiral_sequence;
}

function binary(sequence) {
  // support functions in float_to_bin.js
  let binary_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      binary(step);
    }
    else {
      let normalPart, fracPart, base2float, bin32exp, bin32mantissa, sign;
      // Extract the integer from the real number
      normalPart = parseInt(Math.abs(step));
      // Extract the fractional part from the real number
      fracPart = Math.abs(step) - normalPart;
      // Resolve sign of the number for the sign bit
      sign = Math.abs(step) === step ? '0' : '1';
      // Get the base2 representation of the real number
      base2float = convert2bin(normalPart) + '.' + frac2bin(fracPart);
      // Calculate the value of exp for Normalized number (https://en.wikipedia.org/wiki/Normalized_number)
      var exp = base2float.indexOf('.') - base2float.indexOf('1');
      if ( exp > 0 ) {
        exp = exp - 1;
      }
      // Get the 8-bit exponent part
      if ( exp !== 1 ) {
        bin32exp = pad(convert2bin(127 + exp), 8, 1);
      }
      else {
        bin32exp = pad('', 8, 1);
      }
      // Get the 23-bit mantissa part
      bin32mantissa = pad(binary32mantissa(base2float, exp), 23, 0);
      // Return the 32-bit binary32 representation
      var bin32float = (bin32exp + bin32mantissa).slice(0, 31);
      // push each binary digit into the out array
      let binary_for_this_step = (sign + bin32float).split('');
      for (var i = 0; i < binary_for_this_step.length; i++) {
        binary_sequence.push(binary_for_this_step[i]);
      }
    }
  }
  return binary_sequence;
}

function map(sequence, new_values) {
  let mapped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      mapped_sequence[key] = map(step, new_values);
    }
    else {
      mapped_sequence[key] = new_values.reduce((a, b) => {
        return Math.abs(b - step) < Math.abs(a - step) ? b : a;
      });
    }
  }
  return mapped_sequence;
}

function unique(sequence) {
   return Array.from(new Set(sequence));
}

function abs(sequence) {
  let abs_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      abs_sequence[key] = abs(step, amt);
    }
    else {
      abs_sequence[key] = Math.abs(step);
    }
  }
  return abs_sequence;
}

function gt(sequence, amt) {
  let gt_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gt_sequence[key] = gt(step, amt);
    }
    else {
      gt_sequence[key] = (Number(step) > Number(amt)) ? 1 : 0;
    }
  }
  return gt_sequence;
}

function gte(sequence, amt) {
  let gte_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gte_sequence[key] = gte(step, amt);
    }
    else {
      gte_sequence[key] = (Number(step) >= Number(amt)) ? 1 : 0;
    }
  }
  return gte_sequence;
}

function lt(sequence, amt) {
  let lt_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      lt_sequence[key] = lt(step, amt);
    }
    else {
      lt_sequence[key] = (Number(step) < Number(amt)) ? 1 : 0;
    }
  }
  return lt_sequence;
}

function lte(sequence, amt) {
  let lte_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      lte_sequence[key] = lte(step, amt);
    }
    else {
      lte_sequence[key] = (Number(step) <= Number(amt)) ? 1 : 0;
    }
  }
  return lte_sequence;
}

function modulo(sequence, amt) {
  let modulo_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      modulo_sequence[key] = modulo(step, amt);
    }
    else {
      modulo_sequence[key] = Number(step) % Number(amt);
    }
  }
  return modulo_sequence;
}

function gain(sequence, amt) {
  let gain_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      gain_sequence[key] = gain(step, amt);
    }
    else {
      gain_sequence[key] = (Number(step) * Number(amt));
    }
  }
  return gain_sequence;
}

function reduce(sequence, new_size) {
  let orig_size = sequence.length;
  new_size = Number(new_size);
  if ( new_size > orig_size ) {
    return sequence;
  }
  let reduced_sequence = [];
  for ( let i = 0; i < new_size; i++ ) {
    let large_array_index = Math.floor(i * (orig_size + Math.floor(orig_size / new_size)) / new_size);
    reduced_sequence[i] = sequence[large_array_index];
  }
  return reduced_sequence;
}

function shuffle(sequence) {
  let shuffle_sequence = sequence;
  for (let i = shuffle_sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffle_sequence[i], shuffle_sequence[j]] = [shuffle_sequence[j], shuffle_sequence[i]];
  }
  for (const [key, step] of Object.entries(shuffle_sequence)) {
    if ( Array.isArray(step) ) {
      shuffle_sequence[key] = shuffle(step);
    }
  }
  return shuffle_sequence;
}

function round(sequence) {
  let rounded_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      rounded_sequence[key] = round(step);
    }
    else {
      rounded_sequence[key] = Math.round(step);
    }
  }
  return rounded_sequence;
}

function sort(sequence) {
  let sorted_sequence = [];
  sorted_sequence = sequence.sort(function(a, b) {
    return a - b;
  });
  for (const [key, step] of Object.entries(sorted_sequence)) {
    if ( Array.isArray(step) ) {
      sorted_sequence[key] = sort(step);
    }
  }
  return sorted_sequence;
}

function log(sequence, base, rotation = 1) {
    return warp(sequence, base, rotation);
}

function pow(sequence, base, rotation = 1) {
    return reverse(invert(warp(sequence, base, rotation)));
}

function warp(sequence, base, rotation = 1) {
  // forked from: https://github.com/naomiaro/fade-curves/blob/master/index.js
  let warp_sequence = [];
  let length = sequence.length;
  base = Math.abs(Number(base));
  rotation = Number(rotation);
  let curve = new Float32Array(length), index, x = 0, i;
  // create a curve that will be used to look up the original pattern's keys nonlinearly
  for ( i = 0; i < length; i++ ) {
    index = rotation > 0 ? i : length - 1 - i;
    x = i / length;
    curve[index] = Math.log(1 + base * x) / Math.log(1 + base);
  }
  // loop through the curve, pushing the corresponding pattern keys into the warped structure
  for (var a = 0; a < length; a++) {
    foo = Math.round(Number(curve[a]) * length);
    if (foo >= sequence.length ) {
        foo = sequence.length - 1;
    }
    if ( Array.isArray(sequence[foo]) ) {
      warp_sequence[a] = warp(sequence[foo], base, rotation);
    }
    else {
      warp_sequence[a] = sequence[foo];
    }
  }
  return warp_sequence;
}

function subset(sequence, percentage) {
  percentage = Number(percentage);
  if ( percentage < 0 ) {
    percentage = 0;
  }
  else if ( percentage > 1 ) {
    percentage = 1;
  }
  let subset_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      subset_sequence[key] = subset(step, percentage);
    }
    else {
      if ( Math.random() < percentage ) {
        subset_sequence.push(step);
      }
    }
  }
  return subset_sequence;
}

function range(sequence, new_min, new_max) {
  // this is a horizontal range - returns a range of the buffer
  min = parseInt(Number(new_min) * sequence.length);
  max = parseInt(Number(new_max) * sequence.length);
  let range_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      range_sequence[key] = range(step, Number(new_min), Number(new_max));
    }
    else {
      if ( Number(key) >= min && Number(key) <= max ) {
        range_sequence.push(step);
      }
    }
  }
  return range_sequence;
}

function shift(sequence, amt) {
  let moved_sequence = [];
  amt = Number(amt);
  // wrap the phase shift amount between -1 and 1
  if (amt < -1 || amt > 1 ) {
    let new_amt = amt;
    let amt_is_outside_range = ((amt < -1) || (amt > 1));
    while (amt_is_outside_range) {
      if ( new_amt < -1 )  {
        new_amt = 1 - Math.abs(new_amt - -1);
      }
      else if ( new_amt > 1 ) {
        new_amt = -1 + Math.abs(new_amt - 1);
      }
      amt_is_outside_range = ((new_amt < -1) || (new_amt > 1));
    }
    amt = new_amt;
  }

  // moving left require the keys to become bigger, but the argument makes more sense
  // when moving left is negative, hence the * - 1 here.
  direction = -1 * (amt * sequence.length);
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      moved_sequence[key] = shift(step, direction);
    }
    else {
      let new_key = Math.round(Number(key) + Number(direction));
      if ( new_key < 0 ) {
        // wrap to end
        new_key = sequence.length - (Math.abs(new_key));
      }
      else if ( new_key >= sequence.length ) {
        // wrap to beginning
        new_key = Math.abs((sequence.length + 1) - new_key);
      }
      moved_sequence[key] = sequence[new_key];
    }
  }
  return moved_sequence;
}

function nonzero(sequence) {
    let nonzero_sequence = [];
    let prev_val;
    let cur_val;
    for (const [key, step] of Object.entries(sequence)) {
      if ( Array.isArray(step) ) {
        nonzero_sequence[key] = nonzero(step);
      }
      else {
        cur_val = step;
        if ( Number(cur_val) == 0 ) {
            if ( prev_val ) {
                cur_val = prev_val;
            }
            else {
                continue;
            }
        }
        else {
            prev_val = step;
        }
        nonzero_sequence[key] = cur_val;
      }
    }
    return nonzero_sequence;
}

function scale(sequence, new_min, new_max) {
  if ( sequence.length == 1 ) {
    return [(Number(new_max) + Number(new_min)) / 2];
  }
  // first determine existing range
  let min = Math.min.apply(Math, sequence);
  let max = Math.max.apply(Math, sequence);
  // now scale each value based on new_min, new_max
  let scaled_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      scaled_sequence[key] = scale(step, Number(new_min), Number(new_max));
    }
    else {
      let new_val = scaleInner(step, [min,max], [Number(new_min), Number(new_max)]);
      scaled_sequence[key] = Number(new_val.toFixed(4));
    }
  }
  return scaled_sequence;
}

function scaleInner( value, r1, r2 ) {
    return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
}

function distavg(sequence) {
  let dist_sequence = [];
  let average = sequence.reduce((a, b) => a + b) / sequence.length;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      dist_sequence[key] = distavg(step);
    }
    else {
      dist_sequence[key] = Number((step - average).toFixed(4));
    }
  }
  return dist_sequence;
}

function sticky(sequence, amt) {
  amt = Number(amt);
  if ( amt < 0 ) {
    amt = 0;
  }
  else if ( amt > 1 ) {
    amt = 1;
  }
  let sticky_sequence = [];
  let stuck_key;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      sticky_sequence[key] = sticky(step, amt);
    }
    else {
      if ( Math.random() > amt ) {
        stuck_key = key;
        sticky_sequence[key] = step;
      }
      else {
        if ( sequence[stuck_key] ) {
          sticky_sequence[key] = sequence[stuck_key];
        }
        else {
          sticky_sequence[key] = step;
        }
      }
    }
  }
  return sticky_sequence;
}

function saheach(sequence, num) {
  num = Math.round(Math.abs(Number(num)));
  let count = 0;
  let sah_sequence = [];
  let prev_step;
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      sah_sequence[key] = sahevery(step, num);
    }
    else {
      if ( count % num == 0 || key == 0 ) {
        sah_sequence[key] = step;
        prev_step = step;
      }
      else {
        sah_sequence[key] = prev_step;
      }
    }
    count++;
  }
  return sah_sequence;
}

function clip(sequence, min, max) {
  let clipped_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      clipped_sequence[key] = clip(step, Number(min), Number(max));
    }
    else {
      if ( step < min ) {
        clipped_sequence[key] = Number(min);
      }
      else if ( step > max ) {
        clipped_sequence[key] = Number(max);
      }
      else {
        clipped_sequence[key] = step;
      }
    }
  }
  return clipped_sequence;
}

function saturate(sequence, gain) {
  gain = Number(gain);
  let saturated_sequence = [];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      saturated_sequence[key] = saturate(step, gain);
    }
    else {
      saturated_sequence[key] = Math.tanh(step * gain).toFixed(4);;
    }
  }
  return saturated_sequence;
}

function invert(sequence) {
  let inverted_sequence = [];
  let min = Math.min.apply(Math, sequence);
  let max = Math.max.apply(Math, sequence);
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      inverted_sequence[key] = invert(step);
    }
    else {
      inverted_sequence[key] = min + (max - step);
    }
  }
  return inverted_sequence;
}

function at(sequence, position, value) {
  position = clip([Math.abs(Number(position))],0,1);
  let replace_position = Math.round(position * (sequence.length-1));
  sequence[replace_position] = value;
  return sequence;
}

function interp(sequence, args) {
  let interp_sequence = [];
  let amt = Math.abs(Number(args[0]));
  let mult_str = args[1].replace(',', ' ');
  let mult_sequence = mult(mult_str);
  let same_size_arrays = makeArraysTheSameSize(sequence, mult_sequence);
  sequence = same_size_arrays[0];
  mult_sequence = same_size_arrays[1];
  for (const [key, step] of Object.entries(sequence)) {
    if ( Array.isArray(step) ) {
      interp_sequence[key] = interp(step, destination_prop, amt);
    }
    else {
      // linear interpolation between the two provided sequences
      let seq_amt = (1 - amt) * step;
      let mult_amt = amt * mult_sequence[key];
      let avg = (seq_amt + mult_amt);
      interp_sequence[key] = avg;
    }
  }
  return interp_sequence;
}

// WINDOW operations
function applyWindow(signal, func) {
  var i, n=signal.length, args=[0,n]

  // pass rest of args
  for(i=2; i<arguments.length; i++) {
    args[i] = arguments[i]
  }

  for(i=n-1; i>=0; i--) {
    args[0] = i
    signal[i] *= func.apply(null,args)
  }
  return signal;
}

function fade(sequence) {
  return applyWindow(sequence, hamming);
}

function flattop(sequence) {
  return applyWindow(sequence, flatTopInner);
}

function hamming (i,N) {
  return 0.54 - 0.46 * Math.cos(6.283185307179586*i/(N-1))
}

function flatTopInner (i,N) {
  var a0 = 1,
      a1 = 1.93,
      a2 = 1.29,
      a3 = 0.388,
      a4 = 0.028,
      f = 6.283185307179586*i/(N-1)

  return a0 - a1*Math.cos(f) +a2*Math.cos(2*f) - a3*Math.cos(3*f) + a4 * Math.cos(4*f)
}
// END WINDOW operations. shimmed from https://github.com/scijs/window-function

// END pattern operations

// BEGIN pattern generators. NO sequence argument
function sine(periods, length) {
  let sine_sequence = [];
  periods = Math.abs(Number(periods));
  length = Math.abs(Number(length));
  for (var a = 0; a < periods; a++) {
    for (var i = 0; i < length; i++) {
      let num_scaled = (Math.PI * 2) * (i / length);
      sine_sequence[(a * length) + i] = Number(Math.sin(num_scaled).toFixed(4));
    }
  }
  // scale sine from 0 to 1 and make the first sample be 0
  return shift(scale(sine_sequence,0,1), ((1/periods) * 0.25));
}

function cosine(periods, length) {
  // apply a 0.25 phase shift to a sine
  let cosine_sequence = [];
  periods = Math.abs(Number(periods));
  length = Math.abs(Number(length));
  let sine_sequence = sine(periods, length);
  return shift(sine_sequence, ((1/periods) * -0.25));
}

function tri(periods, length) {
  let tri_sequence = [];
  periods = Math.abs(Number(periods));
  length = Math.abs(Number(length));
  // create a ramp from 0 to 1
  for (var i = 0; i <= (length - 1); i++) {
    let num_scaled = i / (length - 1);
    tri_sequence[i] = Number(num_scaled.toFixed(4));
  }
  // palindrome the ramp to create a triangle, then reduce it to the specified length
  let tri = reduce(palindrome(tri_sequence), length);
  // now copy that triangle for n periods
  tri_sequence = [];
  for (var a = 0; a < periods; a++) {
    for (var i = 0; i <= (length - 1); i++) {
      tri_sequence[(a * length) + i] = tri[i];
    }
  }
  return tri_sequence;
}

function square(periods, length) {
  let square_sequence = [];
  periods = Math.abs(Number(periods));
  length = Math.abs(Number(length));
  for (var a = 0; a < periods; a++) {
    for (var i = 0; i < length; i++) {
      let num_scaled = 0;
      if ( i / length > 0.5 ) {
        num_scaled = 1;
      }
      square_sequence[(a * length) + i] = Number(Math.sin(num_scaled).toFixed(4));
    }
  }
  return square_sequence;
}

function drunk(length, intensity) {
  let drunk_sequence = [];
  let d = Math.random();
  for (var i = 0; i < length; i++) {
    let amount_to_add = Math.random() * Number(intensity);
    if ( Math.random() < 0.5 ) {
      amount_to_add *= -1;
    }
    d += amount_to_add;
    if ( d < 0 ) {
      d = 0;
    }
    if ( d > 1 ) {
      d = 1;
    }
    drunk_sequence[i] = d.toFixed(4);
  }
  return drunk_sequence;
}

function turing(length) {
  length = Math.abs(Number(length));
  return round(noise(length));
}

function mult(destination_prop) {
  let split = destination_prop.split(' ');
  let destination = split[0];
  let prop = split[1];
  if ( !destination || !prop || split.length != 2 ) {
    throw `Could not parse mult: ${destination_prop}`;
  }
  let mult_sequence = facets[destination][prop];
  if ( !mult_sequence ) {
    return [];
  }
  mult_sequence = mult_sequence.split(' ');
  return mult_sequence;
}

function any() {
  if ( facets.length == 0 || !facets ) {
    throw `Could not run any(); no prior commands have been run`;
  }
  // randomly select any of the prior commands in the block
  let facet_keys = Object.keys(facets);
  let selected_facet = facets[facet_keys[facet_keys.length * Math.random() << 0]];
  let selected_facet_value = Object.values(selected_facet);
  return selected_facet_value[0].split(' ');
}

function phasor(periods, length) {
  periods = Math.abs(Number(periods));
  length = Math.abs(Number(length));
  return dup(ramp(0,1,length), periods);
}

function noise(length) {
  let noise_sequence = [];
  for (var i = 0; i < length; i++) {
    noise_sequence[i] = Math.random();
  }
  return noise_sequence;
}

function ramp(from, to, size) {
  let ramp_sequence = [];
  from = Number(from);
  to = Number(to);
  size = Math.abs(Number(size));
  let amount_to_add = (Math.abs(to - from) / size);
  if ( to < from ) {
    amount_to_add *= -1;
  }
  for (var i = 0; i < size; i++) {
    ramp_sequence[i] = from;
    from += amount_to_add;
  }
  return ramp_sequence;
}

function data(list) {
  // user can supply an aribtrary array of data to certain functions like am()
  return list;
}

function brot(length, x, y) {
  // iterates based on the function used to generate the mandelbrot set.
  // takes a complex number (x,y). squares x, adds y... repeat.
  // the output of this function is the x value. sadly there is just as much information in y
  // but wavetables (the destination for facet's data) are 2D not 3D!
  // the best values for x are within -0.8 and 0.25
  // the best values for y are within -0.8 0.8
  length = Math.abs(Number(length));
  x = Number(x);
  y = Number(y);
  let brot_sequence = [];
  for (var i = 0; i < length; i++) {
    brot_sequence.push(x);
    x = (x*x) + y;
  }
  return clip(brot_sequence,-1, 1);
}
// END pattern generators
