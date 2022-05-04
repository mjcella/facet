# Facet: live coding for Max in the browser

## Overview

Facet is a flexible, JavaScript-based live coding system for Max. Using a code editor in the browser, you can build and transmit commands to algorithmically generate and manipulate multiple channels of audio and control data in real-time.

The language is similar to other live coding environments like [TidalCycles](https://tidalcycles.org/Welcome) and [Hydra](https://hydra.ojack.xyz/) where simple commands are chained together to create complex patterns of data. The patterns can be scaled, offset, modulated, shuffled, duplicated, and more into any range or scale.

Facet runs as a NodeJS server on your local machine, with minimal CPU overhead in Max. It allows for sample-accurate DSP from 1 sample up to multiple seconds of audio. It also can incorporate variables from your Max patcher as if they were global variables in your code, and you can attach commands to event "hooks" so they automatically rerun when a certain event occurs in Max.

## Getting started

1. Make sure you a running Max 8.0+. Facet will not work with previous versions.
2. Download Node.js and npm: https://www.npmjs.com/get-npm
3. In a terminal, while in the root of the facet repo, run `npm install`
4. In a browser, open the index.html page. A blank code editor should appear.

Alternatively, you can install the Facet repo as part of your localhost web server, so that you don't need to navigate to the `index.html` page. For example, on my machine (OSX Catalina), I run Facet from http://127.0.0.1/~cella/facet/.

5. In Max, add the Facet repo and all subdirectories to your file preferences.
6. In Max, open `examples/facet_helloworld.maxpat`.
7. Copy this command into the code editor in the browser: `new $('helloworld').sine(60,10).gain(0.1123);` Move your cursor so it's on the line. Hit `[ctrl + enter]` to run the command. The code editor application will always briefly highlights to illustrate what command(s) ran. You should hear a sine wave.

## Facet commands

### Structure

Facet commands are based entirely around JavaScript, using a custom class called a `FacetPattern`. When constructed, you can give the FacetPattern a name, e.g.: `new FacetPattern('example');`. **A FacetPattern must have a name if you want to use it in Max.**

The FacetPattern has no data when it initializes, so first, we need to generate and attach some data. (The `FacetPattern generators` section of the command reference below has a list of all generators).

`new FacetPattern('example').from([1,1,2,3]);`

Next, translate that data somehow. (The `FacetPattern modulators` section of the command reference below has a list of all modulators).

`new FacetPattern('example').from([1,1,2,3]).palindrome();`

However, not all FacetPatterns need to be "findable" to Max. For example, if you are adding two FacetPatterns together, and you only care about the sum, then you can leave empty the name of the second FacetPattern. Note how only the first FacetPattern has a name: `new FacetPattern('example_name').noise(128).add(new FacetPattern().sine(1,128));`

Finally, there are shorthands to improve syntax and legibility. The rest of this document will use these shorthands.

`new FacetPattern('example') == $('example') // shorthand for FacetPattern with a name`

`new FacetPattern() == _;                    // shorthand for FacetPattern with no name`

[This overview video](https://youtu.be/lmOH-wJPfAk) has more details on writing commands.

### How to run

- Run command(s): `[ctrl + enter]`. All commands not separated by multiple newlines will run together.
- Clear all `facet` objects in Max (effectively a global mute): `[ctrl + m]`

## Connecting to Max

In order to receive commands from the browser, all Max patches must have **one and only one** instance of a `facet_server` object. This will load an ExpressJS server via a node.script object behind the scenes. It will listen for HTTP POSTs, parse the commands, and  automatically update any `facet` objects in your patch with an identical name to the FacetPattern's name.

Create a `facet` object in Max, matching the FacetPattern's name in your code:

```
// browser code
new $('example').noise(10000).times(_.ramp(1,0,10000).log(100));

// max object
|=============|
|facet example|
|=============|
```

The `facet example` Max object will now be emitting a signal with whatever data you attach to it when you run commands. Voila!

### Variables

You can send variables from Max into Facet, making it possible to run code with variables that you can control externally. The right inlet of the `facet_server` Max object will take custom variables in this format: `foo $1`.

#### mousex / mousey

Both `mousex` and `mousey`, as floating-point number representations of your cursor's position on your screen, are available for use in commands, e.g.:

```
new $('example').sine(1,1000).gain(mousey); // cursor y position controls volume every time the code runs
```

## Command reference

### Single number generators
- **choose** ( _pattern_ )
	- returns a randomly selected value from a supplied array.
	- example:
		- `new $('example').sine(1,40).rerun(choose([1,2,3])); // sine wave with either 2, 3, or 4 cycles`
---
- **random** ( _min_ = 0, _max_ = 1, _int_mode_ = 0 )
	- returns a random number between `min` and `max`. If `int_mode` = 1, returns an integer. Otherwise, returns a float by default.
	- example:
		- `new $('example').sine(random(1,100,1),40) // a sine wave with 1 - 100 cycles`
---
### FacetPattern modulators
- **abs** ( )
	- returns the absolute value of all numbers in the FacetPattern.
	- example:
		- `new $('example').sine(1,100).offset(-0.3).abs(); // a wonky sine`
---
- **at** ( _position_, _value_ )
	- replaces the value of a FacetPattern at the relative position `position` with `value`.
	- example:
		- `new $('example').turing(16).at(0,1); // the 1st value of the 16-step Turing sequence (i.e. 0% position) is always 1`
		- `new $('example').turing(16).at(0.5,2); // the 9th value of the 16-step Turing sequence (i.e. 50% position) is always 2`
---
- **changed** ( )
	- returns a 1 or 0 for each value in the FacetPattern. If the value is different than the previous value, returns a 1. Otherwise returns a 0. (The first value is compared against the last value in the FacetPattern.)
	- example:
		- `new $('example').from([1,1,3,4]).changed(); // 1 0 1 1`
---
- **clip** ( _min_, _max_ )
	- clips any numbers in the FacetPattern to a `min` and `max` range.
	- example:
		- `new $('example').from([1,2,3,4]).clip(2,3); // 2 2 3 3 `
---
- **curve** ( _tension_ = 0.5, _segments_ = 25 )
	- returns a curved version of the FacetPattern. Tension and number of segments in the curve can be included but default to 0.5 and 25, respectively.
	- example:
		- `new $('example').noise(16).curve();				// not so noisy`
		- `new $('example').noise(16).curve(0.5, 10);	// fewer segments per curve`
		- `new $('example').noise(16).curve(0.9);			// different curve type`
---
- **distavg** ( )
	- computes the distance from the average of the FacetPattern, for each element in the FacetPattern.
	- example:
		- `new $('example').from([0.1,4,3.14]).distavg(); // -2.3133 1.5867 0.7267`
---
- **dup** ( _num_ )
	- duplicates the FacetPattern `num` times.
	- example:
		- `new $('example').sine(1,100).dup(random(2,4,1)); // sine has 2, 3, or 4 cycles `
---
- **echo** ( _num_, _feedback_ = 0.666 )
	- repeats the FacetPattern `num` times, with amplitude multiplied by `feedback` each repeat.
	- example:
		- `new $('example').from([1]).echo(5); // 1 0.666 0.4435 0.29540 0.19674 0.13103`
		- `new $('example').phasor(5,20).echo(8); // phasor decreases after each 5 cycles `
---
- **flipAbove** ( _maximum_ )
	- for all values above `maximum`, it returns `maximum` minus how far above the value was.
	- example:
		- `new $('example').sine(1,1000).flipAbove(0.2); // wonky sine`
---
- **flipBelow** ( _min_ )
	- for all values below `minimum`, it returns `minimum` plus how far below the value was.
	- example:
		- `new $('example').sine(1,1000).flipBelow(0.2); // inverse wonky sine`
---
- **fft** ( )
	- computes the FFT of the FacetPattern, translating the FacetPattern data into "phase data" that could theoretically reconstruct it using sine waves.
	- example:
		- `new $('example').from([1,0,1,1]).fft(); // 3 0 0 1 1 0 0 -1`
---
- **fracture** ( _pieces_ )
	- divides and scrambles the FacetPattern into `pieces` pieces.
	- example:
		- `new $('example').phasor(1,1000).fracture(100); // the phasor has shattered into 100 pieces!`
---
- **invert** ( )
	- computes the `minimum` and `maximum` values in the FacetPattern, then scales every number to the opposite position, relative to `minimum` and `maximum`.
	- example:
		- `new $('example').from([0,0.1,0.5,0.667,1]).invert(); // 1 0.9 0.5 0.333 0`
---
- **iter** ( _num_times_, _prob_, _commands_ )
	- A shorthand for rerunning a certain command over and over, with prob as a float between 0 and 1 controlling the likelihood that the code actually runs.
	- example:
		- `new $('example').randsamp().iter(6,1,'comb(random(1,200))'); // six random comb filters in series`
		- `new $('example').randsamp().iter(6,0.5,'comb(random(1,200))'); // anywhere from 0 - 6 comb filters in series`
---
- **fade** ( )
	- applies a crossfade window to the FacetPattern, so the beginning and end are faded out.
	- example:
		- `new $('example').noise(1024).fade();`
---
- **flattop** ( )
	- applies a flat top window to the FacetPattern, which a different flavor of fade.
	- example:
		- `fnew $('example').noise(1024).flattop();`
---
- **gain** ( _amt_ )
	- multiplies every value in the FacetPattern by a number.
	- example:
		- `new $('example').from([0,1,2]).gain(100); // 0 100 200`
		- `new $('example').from([0,1,2]).gain(0.5); // 0 0.5 1`
---
- **gt** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than `amt` and `0` for all other values.
	- example:
		- `new $('example').from([0.1,0.3,0.5,0.7]).gt(0.6); // 0 0 0 1`
---
- **gte** ( _amt_ )
	- returns `1` for every value in the FacetPattern greater than or equal to `amt` and `0` for all other values.
	- example:
		- `new $('example').from([0.1,0.3,0.5,0.7]).gte(0.5); // 0 0 1 1`
---
- **jam** ( _prob_, _amt_ )
	- changes values in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each value changing. `amt` is how much bigger or smaller the changed values can be. If `amt` is set to 2, and `prob` is set to 0.5 half the values could have any number between 2 and -2 added to them.
	- example:
		- `new $('example').drunk(128,0.05).jam(0.1,0.7); // small 128 step random walk with larger deviations from the jam`
---
- **lt** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than `amt` and `0` for all other values.
	- example:
		- `new $('example').from([0.1,0.3,0.5,0.7]).lt(0.6); // 1 1 0 0`
---
- **lte** ( _amt_ )
	- returns `1` for every value in the FacetPattern less than or equal to `amt` and `0` for all other values.
	- example:
		- `new $('example').from(0.1,0.3,0.5,0.7]).lte(0.5); // 1 1 1 0`
---
- **log** ( _base_, _direction_ )
	- stretches a FacetPattern according to a logarithmic curve `base`, where the values at the end can be stretched for a significant portion of the FacetPattern, and the values at the beginning can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `new $('example').ramp(1,0,1000).log(100); // a logarithmic curve from 1 to 0`
---
- **modulo** ( _amt_ )
	- returns the modulo i.e. `% amt` calculation for each value in the FacetPattern.
	- example:
		- `new $('example').from([1,2,3,4]).modulo(3); // 1 2 0 1`
---
- **normalize** ( )
	- scales the FacetPattern to the 0 - 1 range.
	- example:
		- `new $('example').sine(1,100).gain(4000).normalize(); // the gain is undone!`
		- `new $('example')sine(1,100).scale(-1, 1).normalize(); // works with negative values`
---
- **offset** ( _amt_ )
	- adds `amt` to each value in the FacetPattern.
	- example:
		- `new $('example').sine(4,40).offset(-0.2); // sine's dipping into negative territory`
---
- **palindrome** ( )
	- returns the original FacetPattern plus the reversed FacetPattern.
	- example:
		- `new $('example').from([0,1,2,3]).palindrome(); // 0 1 2 3 3 2 1 0`
---
- **pong** ( _min_, _max_ )
	- folds FacetPattern values greater than `max` so their output continues at `min`.  If the values are twice greater than `max`, their output continues at `min` again. Similar for values less than `min`, such that they wrap around the min/max thresholds.
	- example:
		- `new $('example').sine(1,1000).offset(-0.1).pong(0.2,0.5); // EZ cool waveform ready to normalize`
---
- **pow** ( _expo_, _direction_ = 1 )
	- stretches a FacetPattern according to an exponential power `expo`, where the values at the beginning can be stretched for a significant portion of the FacetPattern, and the values at the end can be squished together. If `direction` is negative, returns the FacetPattern in reverse.
	- example:
		- `new $('example').sine(5,200).pow(6.5); // squished into the end`
		- `new $('example').sine(5,200).pow(6.5,-1) // squished at the beginning`
---
- **prob** ( _amt_ )
	- sets some values in the FacetPattern to 0. `prob` (float 0-1) sets the likelihood of each value changing.
	- example:
		- `new $('example').from([1,2,3,4]).prob(0.5); // 1 0 3 0 first time it runs`
		- `new $('example').from([1,2,3,4]).prob(0.5); // 0 0 3 4 second time it runs`
		- `new $('example').from([1,2,3,4]).prob(0.5); // 0 2 3 4 third time it runs`
---
- **quantize** ( _resolution_ )
	- returns `0` for every step in the FacetPattern whose position is not a multiple of `resolution`.
	- example:
		- `new $('example').drunk(16,0.5).quantize(4); // 0.5241 0 0 0 0.7420 0 0 0 1.0 0 0 0 0.4268 0 0 0`
---
- **range** ( _new_min_, _new_max_ )
	- returns the subset of the FacetPattern from the relative positions of `new_min` (float 0-1) and `new_max` (float 0-1).
	- example:
		- `new $('example').from([0.1,0.2,0.3,0.4]).range(0.5,1); // 0.3 0.4`
---
- **recurse** ( _prob_ )
	- randomly copies portions of the FacetPattern onto itself, creating nested, self-similar structures. `prob` (float 0-1) sets the likelihood of each value running a recursive copying process.
	- example:
		- `new $('example').noise(128).recurse(0.7); // remove the recurse to hear the difference `
---
- **reduce** ( _new_size_ )
	- reduces the FacetPattern length to `new_size`. If `new_size` is larger than the FacetPattern length, no change.
	- example:
		- `new $('example').from([1,2,3,4]).reduce(2); // 1 3`
---
- **rerun** ( _num_ )
	- reruns the datum and operations that precede the rerun command, appending the results of each iteration to the FacetPattern. If the commands that are being rerun have elements of randomness in them, each iteration of rerun will be potentially unique. This is different than dup(), where each copy is identical.
	- example:
		- `new $('example').phasor(1,random(10,50,1)).rerun(random(1,6,1)); // run a phasor between 2 and 7 times total, where each cycle will have a random number between 10 and 50 values in its cycle.`
---
- **reverse** ( )
	- returns the reversed FacetPattern.
	- example:
		- `new $('example').phasor(1,1000).reverse(); // go from 1 to 0 over 1000 values`
---
- **round** (  )
	- rounds all values in the FacetPattern to an integer.
	- example:
		- `new $('example').from([0.1,0.5,0.9,1.1]).round(); // 0 1 1 1`
---
- **saheach** ( _n_ )
	- samples and holds every `nth` value in the FacetPattern.
	- example:
		- `new $('example').phasor(1,20).saheach(2); // 0 0 0.1 0.1 0.2 0.2 0.3 0.3 0.4 0.4 0.5 0.5 0.6 0.6 0.7 0.7 0.8 0.8 0.9 0.9`
---
- **saturate** ( _gain_ )
	- runs nonlinear waveshaping (distortion) on the FacetPattern, always returning values between -1 and 1.
	- example:
		- `new $('example').phasor(1,20).gain(10).saturate(6); // 0 0.995 0.9999 0.99999996 0.9999999999 0.999999999999 0.9999999999999996 1 1 1 1 1 1 1 1 1 1 1 1 1`
---
- **scale** ( _new_min_, _new_max_ )
	- moves the FacetPattern to a new range, from `new_min` to `new_max`. **NOTE**: this function will return the average of new_min and new_max if the FacetPattern is only 1 value long. since you cannot interpolate where the value would fall in the new range, without a larger FacetPattern to provide initial context of the value's relative position. This operation works better with sequences larger than 3 or 4.
	- example:
		- `new $('example').sine(10,100).scale(-1,1); // bipolar signal`
---
- **shift** ( _amt_ )
	- moves the FacetPattern to the left or the right. `amt` gets wrapped to values between -1 and 1, since you can't shift more than 100% left or 100% right.
	- example:
		- `new $('example').from([1,2,3,4]).shift(-0.5); // 3 4 2 1`
---
- **shuffle** ( )
	- randomizes the FacetPattern.
	- example:
		- `new $('example').from([1,2,3,4]).shuffle(); // first time: 3 2 1 4`
		- `new $('example').from([1,2,3,4]).shuffle(); // second time: 1 3 4 2`
---
- **skip** ( _prob_ )
	- Sometimes, skip executing the command, as if it had never been attempted. Useful if you only want to update the wavetable in Max some of the time, but otherwise want to preserve the previous data.
		- example:
		- `new $('example').spiral(16,random(1,360)).skip(0.95);	// only load data into the "new samples" wavetable 5% of the time when this command runs`
---
- **slew** ( _depth_ = 25, _up_speed_ = 1, _down_speed_ = 1 )
	- adds upwards and/or downwards slew to the FacetPattern. `depth` controls how many slew values exist between each value. `up_speed` and `down_speed` control how long the slew lasts: at 0, the slew has no effect, whereas at 1, the slew occurs over the entire `depth` between each FacetPattern value.
	- example:
		- `new $('example').from([0,0.5,0.9,0.1]).slew(25,0,1) // the first three numbers will jump immediately because upwards slew is 0. then it will slew from 0.9 to 0.1 over the course of the entire depth range`
---
- **slices** ( _num_slices_, _prob_, _commands_ )
	- slices the FacetPattern into `num_slices` slices, and for `prob` percent of those slices, runs `commands`, appending all slices back together.
	- example:
		- `new $('example').ramp(0,1,16).slices(16,1,'append(ramp(0.5,1,3))'); // ramps within ramps over 64 values`
---
- **smooth** ( )
	- interpolates each value so it falls exactly between the values that precede and follow it.
	- example:
		- `new $('example').noise(64).smooth(); // less noisy`
---
- **sometimes** (_prob_, _operations_)
	- runs a chain of operations only some of the time, at a probability set by `prob`.

**Note:** currently, `rerun` cannot be used inside a sometimes operation.
```
new $('example').phasor(1,100).sticky(0.5).scale(40,80).sometimes(0.5,'reverse()');
// half the time, pattern goes up; half the time, it goes down
new $('example').drunk(16,0.1).sometimes(0.5,'sort().palindrome()');
// run a sequence that sometimes is random and sometimes goes up and down
```
---
- **sort** ( )
	- returns the FacetPattern ordered lowest to highest.
	- example:
		- `new $('example').sine(1,100).sort(); // a nice smoothing envelope from 0 to 1`
---
- **sticky** ( _amt_ )
	- samples and holds values in the FacetPattern based on probability. `amt` (float 0-1) sets the likelihood of each value being sampled and held.
	- example
		- `new $('example').sine(1,1000).sticky(0.98); // glitchy sine`
---
- **subset** ( _percentage_ )
	- returns a subset of the FacetPattern with `percentage`% values in it.
	- example:
		- `new $('example').phasor(1,50).subset(0.3); // originally 50 values long, now 0.02 0.08 0.50 0.58 0.62 0.700 0.76 0.78 0.92`
---
- **truncate** ( _length_ )
	- truncates the FacetPattern so it's now `length` values long. If `length` is longer than the FacetPattern, return the whole FacetPattern.
	- example:
		- `new $('example').from([0,1,2,3]).truncate(2); // now 2 values long`
		- `new $('example').from([0,1,2,3]).truncate(6); // still 4 values long`
---
- **unique** ( )
	- returns the set of unique values in the FacetPattern.
	- example:
		- `new $('example').from([1,2,3,0,0.4,2]).unique(); // 1 2 3 0 0.4`
---
- **walk** ( _prob_, _amt_ )
	- changes positions in the FacetPattern.  `prob` (float 0-1) sets the likelihood of each position changing. `amt` controls how many steps the values can move. If `amt` is set to 10, and `prob` is set to 0.5 half the values could move 10 positions to the left or the right.
	- example:
		- `new $('example').from([0,1,2,0,1,0.5,2,0]).walk(0.25, 3); // a sequence for jamming`
---
### Pattern modulators with a second pattern as argument
- **add** ( _FacetPattern_ )
	- adds the first FacetPattern and the second FacetPattern.
	- example:
		- `new $('example').sine(1,100).add(data([0.5, 0.25, 0.1, 1]));`
- **and** ( _FacetPattern_ )
	- computes the logical AND of both FacetPattern, returning a 0 if one of the values is 0 and returning a 1 if both of the values are nonzero. If one FacetPattern is smaller, it will get scaled so both FacetPatterns equal each other in size prior to running the operation.
	- example:
		- `new $('example').from([1,0,1,0]).and(_.from([0,1])); // 0 0 1 0`
---
- **append** ( _FacetPattern_ )
	- appends the second FacetPattern onto the first.
	- example:
		- `new $('example').sine(1,100).append(_.phasor(1,100)).append(_.from([1,2,3,4]));`
---
- **divide** ( _FacetPattern_ )
	- divides the first FacetPattern by the second.
	- example:
		- `new $('example').sine(1,100).divide(_.from([0.5,0.25,0.1,1]));`
---
- **equals** ( _FacetPattern_ )
	- computes the logical EQUALS of both FacetPattern, returning a 0 if the values don't equal each other and returning a 1 if they do. If one FacetPattern is smaller, it will get scaled so both FacetPatterns equal each other in size prior to running the operation.
	- example:
		- `new $('example').sine(1,100).equals(_.sine(2,100)); // two sine waves phasing`

- **interlace** ( _FacetPattern_ )
	- interlaces two FacetPatterns. If one FacetPattern is smaller, it will be interspersed evenly throughout the other FacetPattern.
	- example:
		- `new $('example').sine(1,100).interlace(_.phasor(1,20));`
---
- **map** ( _FacetPattern_ )
	- forces all values of the input FacetPattern to be mapped onto a new set of values from a second FacetPattern.**
	- example:
		- `new $('example').from([1,2,3,4]).map([11,12,13,14]); // 11 11 11 11`
		- `new $('example').from([1,2,3,4]).scale(30,34).map(_.from([31,31.5,32,32.5])); // 31 31.5 32.5 32.5`
---
- **nonzero** ( _FacetPattern_ )
	- replaces all instances of 0 with the previous nonzero value. Useful after with probability controls, which by default will set some values to 0. Chaining a nonzero() after that would replace the 0s with the other values the pattern. Particularly in a MIDI context with .prob(), you probably don't want to send MIDI note values of 0, so this will effectively sample and hold each nonzero value, keeping the MIDI note values in the expected range.
	- example:
		- `new $('example').from([1,2,3,4]).prob(0.5).nonzero(); // if 2 and 4 are set to 0 by prob(0.5), the output of .nonzero() would be 1 1 3 3`
---
- **or** ( _FacetPattern_ )
	- computes the logical OR of both FacetPattern, returning a 0 if both of the values are 0 and returning a 1 if either of the values are nonzero. If one FacetPattern is smaller, it will get scaled so both FacetPatterns equal each other in size prior to running the operation.
	- example:
		- `new $('example').from([1,0,1,0]).or(data([0,1])); // 1 0 1 1`
---
- **sieve** ( _FacetPattern_ )
	- uses the second FacetPattern as a lookup table, with each value's relative value determining which value from the input sequence to select.
	- example:
		- `new $('example').noise(1024).sieve(_.sine(10,1024)); // sieving noise with a sine wave into the audio rate :D`
---
- **subtract** ( _FacetPattern_ )
	- subtracts the second FacetPattern from the first.
	- example:
		- `new $('example').sine(1,100).subtract(_.from([0.5,0.25,0.1,1]));`
---
- **times** ( _FacetPattern_ )
	- multiplies the first FacetPattern by the second.
	- example:
		- `new $('example').sine(1,100).times(_.from([0.5,0.25,0.1,1]));`
---
### FacetPattern generators
- **chaos** ( _length_, _x_, _y_)
	- over _length_ iterations, computes `x = (x*x)+y`. Returns the series of all `x` values computed over time. NOTE: iterative functions can have both stable and unstable results ( hello... Mandelbrot set... :D ). However in a musical context, there is not much use for an unstable result which would endlessly grow to infinity. So this function clips between -1 and 1, and there is no danger of sending humongous numbers to Max. For stable results, the best x values are within -0.8 and 0.25, and the best y values are within -0.8 and 0.8.
	- example:
		- ```
			new $('example').chaos(16,(random()-0.5),(random()-0.5)); // 16 values somewhere between -1 and 1, moving upwards, downwards, or finding stability
		```
---
- **cosine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `new $('example').cosine(2,30); // 2 cycles, 30 values each`
---
- **from** ( _pattern_ )
	- allows the user to specify their own pattern. **Note the array syntax!**
	- example:
		- `new $('example').from([1,2,3,4]);`
---
- **drunk** ( _length_, _intensity_ )
	- generates a random walk of values between 0 and 1 for `length` values. `intensity` controls how much to add.
	- example:
		- `new $('example').drunk(16,0.1); // slight random movement`
---
- **noise** ( _length_ )
	- generates a random series of values between9 0 and 1 for `length`.
	- example:
		- `new $('example').noise(1024); // lots of randomness`
---
- **phasor** ( _periods_, _length_ )
	- ramps from 0 to 1 for `periods` periods, each period having length `length`.
	- example:
		- `new $('example').phasor(10,100); // 10 ramps`
---
- **ramp** ( _from_, _to_, _size_ )
	- moves from `from` to `to` over `size` values.
	- example:
		- `new $('example').ramp(250,100,1000); // go from 250 to 100 over 1000 values`
---
- **sine** ( _periods_, _length_ )
	- generates a cosine for `periods` periods, each period having `length` values.
	- example:
		- `new $('example').cosine(2,30); // 2 cycles, 30 values each`
---
- **spiral** ( _length_, _degrees_ = 137.5 )
	- generates a spiral of length `length` of continually ascending values in a circular loop between 0 and 1, where each value is `degrees` away from the previous value. `degrees` can be any number between 0 and 360. By default `degrees` is set to 137.5 which produces an output pattern similar to branching leaves, where each value is as far away as possible from the previous value.
	- example:
		- `new $('example').sine(1,1000).times(_.spiral(1000,random(1,360))); // an interesting, modulated sine wave`
		- `new $('example').spiral(100); // defaults to a Fibonacci leaf spiral`
---
- **square** ( _periods_, _length_ )
	- generates a square wave (all 0 and 1 values) for `periods` periods, each period having `length` values.
	- example:
		- `new $('example').square(5,6); // 5 cycles, 6 values each`
---
- **turing** ( _length_ )
	- generates a pattern of length `length` with random 1s and 0s.
	- example:
		- `new $('example').turing(64); // instant rhythmic triggers`
- **tri** ( _periods_, _length_ )
- generates a triangle wave for `periods` periods, each period having `length` values.
	- example:
		- `new $('example').triangle(30,33); // 30 cycles, 33 values each`
---
### Audio-rate operations

Facet can load audio samples as FacetPatterns and run arbitrary operations on them, but this comes with the caveat that Facet is limited to the CPU power of a single thread on your machine. One idea for future development is to make it so that each command spawns its own sub-process on the machine. I think this would open up more CPU power on multi-core machines. However, in the meantime, there is a CPU% indicator in the bottom window of the browser that can be helpful when running audio operations to see when you are running out of resources.

 To prevent humongous computations, there are some guardrails for certain functions, but not too much. This software is experimental, and it is possible that you accidentally run a command that uses too much computing power. (It happened to me once in a while during development). In that case, you need to kill the node process running in the background. Find the `node` process ID (I use top) and run:

`kill -9 pid_goes_here`

- **audio** ( )
	- scales any FacetPattern to {-1,1} and normalizes it. Useful for preparing FacetPattern for audio output. For example, `sine()` by default returns in a range {0,1}. `audio()` would change that to a bipolar, {-1,1} range.
	- example:
		- `new $('example').randsamp().times(_.noise(4)).audio();`
- **comb** ( _ms_ )
	- generates a comb filtered version of the input FacetPattern, with a delay of `ms` milliseconds.
	- example:
		- `new $('example').randsamp().comb(random(40,100));`
- **convolve** ( _FacetPattern_ )
	- computes the convolution between the two FacetPatterns.
	- example:
		- `new $('example').randsamp().convolve(_.randsamp());	// convolving random samples`
- **dilate** ( _FacetPattern_ )
	- warps the playback speed of the input FacetPattern according to the second lookup FacetPattern. A value of `1` in the lookup sequence will mean the corresponding portion in the playback buffer will play at "regular" speed. Values lower than 1 will play faster, and values higher than 1 will play slower. The second FacetPattern will always be scaled between 0.5 and 1.5 before playing, so that some values are slower and the rest are faster.
	- example:
		- `new $('example').randsamp().dilate(_.sine(30,20).audio());;	// wobbling random samples`
- **mutechunks** ( _chunks_, _prob_ )
	- slices the input FacetPattern into `chunks` windowed chunks (to avoid audible clicks) and mutes `prob` percent of them.
	- example:
		- `new $('example').randsamp().mutechunks(16,0.33);	// 33% of 16 audio slices muted`
- **suspend** ( _start_pos_, _end_pos_ )
	- surrounds the FacetPattern with silence, so that the entire input FacetPattern still occurs, but only for a fraction of the overall resulting FacetPattern. The smallest possible fraction is 1/8 of the input FacetPattern, to safeguard against generating humongous and almost entirely empty wav files.
	- example:
		- `new $('example').randsamp().suspend(0.25,0.75);	// the input pattern is now squished into the middle 50% of the buffer`
- **randsamp** ( _dir_ = `../samples/` )
	- loads a random wav file from the `dir` directory into memory. The default directory is `../samples/`, but you can supply any directory as an argument. Just make sure that directory is available in the Max File Preferences.
	- example:
		- `new $('example').randsamp().reverse(); // random backwards sample`
- **ichunk** ( _FacetPattern_ )
	- slices the input into `FacetPattern.length` windowed chunks (to avoid audible clicks). Loops through every value of `FacetPattern` as a lookup table, determining which ordered chunk of audio from the input sequence it corresponds to, and appends that window to the output buffer.
	- example:
		- `new $('example').randsamp().ichunk(_.ramp(0,0.5,256)); // play 256 slices between point 0 and 0.5 of randsamp()... timestretching :)`
		- `new $('example').noise(4096).sort().ichunk(_.noise(256).sort()); // structuring noise with noise`
- **harmonics** ( _FacetPattern_, _amplitude=0.9_  )
	- superimposes `FacetPattern.length` copies of the input FacetPattern onto the output. Each number in `FacetPattern` corresponds to the frequency of the harmonic, which is a copy of the input signal playing at a different speed. Each harmonic _n_ in the output sequence is slightly lower in level, by 0.9^_n_. Allows for all sorts of crazy sample-accurate polyphony.
	- example:
		- `new $('example').randsamp().harmonics(noise(16).gain(3)).times(ramp(1,0,12000)); // add 16 inharmonic frequencies, all between 0 and 3x the input speed`
		- `new $('example').randsamp().harmonics(map([0,0.5,0.666,0.75,1,1.25,1.3333,1.5,1.6667,2,2.5,3],module.exports.noise(3)) // add 3 harmonics at geometric ratios`
- **sample** ( _filename_ )
	- loads a wav file from the `../samples/` directory into memory. You can specify subdirectories of `../samples/`.
	- example:
		- `new $('example').sample('1234.wav'); // if 1234.wav is in the samples directory, you're good to go`
		- `new $('example').sample('../../anydir/goes/here/myfile.wav'); // or point to the file with a relative path`

### Hooks

- **on** ( _hook_ )
	- Reruns the command Whenever an event with name `hook` is sent as a message to the left inlet of the `facet_server` object in Max.
	- By default, every 32nd note of the Max global transport there is a hook that you can automatically use via, e.g.: `.on(6)`. This would mean the command reruns on the 6th 32nd note of each whole note.
	- Hit `[ctrl + c]` to delete all hooks. You should see a message indicate successful deletion in the browser.
	- Hit `[ctrl + f]` to toggle between muting and un-muting all hooks. You should see a message indicating the current status in the browser.

### Speed

- **speed** ( _amt_ )
	- changes the amount of time that it takes to loop through all values in a pattern.

There are 14 possible speeds to choose from, all of which are in 1:n or n:1 relations with the global transport tempo in Max. (So all the `facet` objects are synced with each other):

-8 = completes pattern over 8 whole notes

-7 = completes pattern over 7 whole notes

-6 = completes pattern over 6 whole notes

-5 = completes pattern over 5 whole notes

-4 = completes pattern over 4 whole notes

-3 = completes pattern over 3 whole notes

-2 = completes pattern over 2 whole notes

-1 / 0 / 1 = default, completes pattern over 1 whole note

2 = completes pattern over 1/2 whole note

3 = completes pattern over 1/3 whole note

4 = completes pattern over 1/4 whole note

5 = completes pattern over 1/5 whole note

6 = completes pattern over 1/6 whole note

7 = completes pattern over 1/7 whole note

8 = completes pattern over 1/8 whole note
