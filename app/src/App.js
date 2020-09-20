import React, { useState, useEffect } from 'react';
import './App.css';

class Effect {

  constructor(context) {
    this.name = "effect";
    this.context = context;
    this.input = this.context.createGain();
    this.effect = null;
    this.bypassed = false;
    this.output = this.context.createGain();
    this.setup();
    this.wireUp();
  }

  setup() {
    this.effect = this.context.createGain();
  }

  wireUp() {
    this.input.connect(this.effect);
    this.effect.connect(this.output);
  }

  connect(destination) {
    this.output.connect(destination);
  }

}

class Sample {
  constructor(context) {
    this.context = context;
    this.buffer = this.context.createBufferSource();
    this.buffer.start();
    this.sampleBuffer = null
    this.rawBuffer = null;
    this.loaded = false;
    this.output = this.context.createGain();
    this.output.gain.value = 1;
  }

  play() {
    if (this.loaded) {
      this.buffer = this.context.createBufferSource();
      this.buffer.buffer = this.sampleBuffer;
      this.buffer.connect(this.output);
      this.buffer.start(this.context.currentTime);
    }
  }

  pause() {
    this.buffer.stop();
  }

  connect(input) {
    this.output.connect(input);
  }

  load(path) {
    this.loaded = false;
    return fetch(path)
      .then((response) => response.arrayBuffer())
      .then((myBlob) => {
        return new Promise((resolve, reject) => {
          this.context.decodeAudioData(myBlob, resolve, reject);
        })
      })
      .then((buffer) => {
        this.sampleBuffer = buffer;
        this.loaded = true;
        return this;
      })
  }
}


class AmpEnvelope {
  constructor(context, gain = 1) {
    this.context = context;
    this.output = this.context.createGain();
    this.output.gain.value = gain;
    this.partials = [];
    this.velocity = 0;
    this.gain = gain;
    this._attack = 0;
    this._decay = 0.001;
    this._sustain = this.output.gain.value;
    this._release = 0.001;
  }

  on(velocity) {
    this.velocity = velocity / 127;
    this.start(this.context.currentTime);
  }

  off(MidiEvent) {
    return this.stop(this.context.currentTime);
  }

  start(time) {
    this.output.gain.value = 0;
    this.output.gain.setValueAtTime(0, time);
    this.output.gain.setTargetAtTime(1, time, this.attack + 0.00001);
    this.output.gain.setTargetAtTime(this.sustain * this.velocity, time + this.attack, this.decay);
  }

  stop(time) {
    this.sustain = this.output.gain.value;
    this.output.gain.cancelScheduledValues(time);
    this.output.gain.setValueAtTime(this.sustain, time);
    this.output.gain.setTargetAtTime(0, time, this.release + 0.00001);
  }

  set attack(value) {
    this._attack = value;
  }

  get attack() {
    return this._attack
  }

  set decay(value) {
    this._decay = value;
  }

  get decay() {
    return this._decay;
  }

  set sustain(value) {
    this.gain = value;
    // this._sustain;
  }

  get sustain() {
    return this.gain;
  }

  set release(value) {
    this._release = value;
  }

  get release() {
    return this._release;
  }

  connect(destination) {
    this.output.connect(destination);
  }
}

class Voice {
  constructor(context, type = "sawtooth", gain = 0.1) {
    this.context = context;
    this.type = type;
    this.value = -1;
    this.gain = gain;
    this.output = this.context.createGain();
    this.partials = [];
    this.output.gain.value = this.gain;
    this.ampEnvelope = new AmpEnvelope(this.context);
    this.ampEnvelope.connect(this.output);
  }

  init() {
    let osc = this.context.createOscillator();
    osc.type = this.type;
    osc.connect(this.ampEnvelope.output);
    osc.start(this.context.currentTime);
    this.partials.push(osc);
  }

  on(MidiEvent) {
    this.value = MidiEvent.value;
    this.partials.forEach((osc) => {
      osc.frequency.value = MidiEvent.frequency;
    });
    this.ampEnvelope.on(MidiEvent.velocity || MidiEvent);
  }

  off(MidiEvent) {
    this.ampEnvelope.off(MidiEvent);
    this.partials.forEach((osc) => {
      osc.stop(this.context.currentTime + this.ampEnvelope.release * 4);
    });
  }

  connect(destination) {
    this.output.connect(destination);
  }

  set detune(value) {
    this.partials.forEach(p => p.detune.value = value);
  }

  set attack(value) {
    this.ampEnvelope.attack = value;
  }

  get attack() {
    return this.ampEnvelope.attack;
  }

  set decay(value) {
    this.ampEnvelope.decay = value;
  }

  get decay() {
    return this.ampEnvelope.decay;
  }

  set sustain(value) {
    this.ampEnvelope.sustain = value;
  }

  get sustain() {
    return this.ampEnvelope.sustain;
  }

  set release(value) {
    this.ampEnvelope.release = value;
  }

  get release() {
    return this.ampEnvelope.release;
  }

}
class Noise extends Voice {
  constructor(context, gain) {
    super(context, gain);
    this._length = 2;
  }

  get length() {
    return this._length || 2;
  }
  set length(value) {
    this._length = value;
  }

  init() {
    var lBuffer = new Float32Array(this.length * this.context.sampleRate);
    var rBuffer = new Float32Array(this.length * this.context.sampleRate);
    for (let i = 0; i < this.length * this.context.sampleRate; i++) {
      lBuffer[i] = 1 - (2 * Math.random());
      rBuffer[i] = 1 - (2 * Math.random());
    }
    let buffer = this.context.createBuffer(2, this.length * this.context.sampleRate, this.context.sampleRate);
    buffer.copyToChannel(lBuffer, 0);
    buffer.copyToChannel(rBuffer, 1);

    let osc = this.context.createBufferSource();
    osc.buffer = buffer;
    osc.loop = true;
    osc.loopStart = 0;
    osc.loopEnd = 2;
    osc.start(this.context.currentTime);
    osc.connect(this.ampEnvelope.output);
    this.partials.push(osc);
  }

  on(MidiEvent) {
    this.value = MidiEvent.value;
    this.ampEnvelope.on(MidiEvent.velocity || MidiEvent);
  }

}

class Filter extends Effect {
  constructor(context, type = "lowpass", cutoff = 1000, resonance = 0.9) {
    super(context);
    this.name = "filter";
    this.effect.frequency.value = cutoff;
    this.effect.Q.value = resonance;
    this.effect.type = type;
  }

  setup() {
    this.effect = this.context.createBiquadFilter();
    this.effect.connect(this.output);
    this.wireUp();
  }

}

var OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
class SimpleReverb extends Effect {
  constructor(context) {
    super(context);
    this.name = "SimpleReverb";
  }

  setup(reverbTime = 1) {
    this.effect = this.context.createConvolver();

    this.reverbTime = reverbTime;

    this.attack = 0.0001;
    this.decay = 0.1;
    this.release = reverbTime;

    this.wet = this.context.createGain();
    this.input.connect(this.wet);
    this.wet.connect(this.effect);
    this.effect.connect(this.output);

    this.renderTail();
  }

  renderTail() {
    console.log("renderTail")
    const tailContext = new OfflineAudioContext(2, this.context.sampleRate * this.reverbTime, this.context.sampleRate);
    tailContext.oncomplete = (buffer) => {
      this.effect.buffer = buffer.renderedBuffer;
    }

    const tailOsc = new Noise(tailContext, 1);
    tailOsc.init();
    tailOsc.connect(tailContext.destination);
    tailOsc.attack = this.attack;
    tailOsc.decay = this.decay;
    tailOsc.release = this.release;


    tailOsc.on({ frequency: 500, velocity: 1 });
    tailContext.startRendering();
    setTimeout(() => {
      tailOsc.off();
    }, 1);


  }

  set decayTime(value) {
    let dc = value / 3;
    this.reverbTime = value;
    this.release = dc;
    return this.renderTail();
  }

}

class AdvancedReverb extends SimpleReverb {
  constructor(context) {
    super(context);
    this.name = "AdvancedReverb";
  }

  setup(reverbTime = 1, preDelay = 0.03) {
    this.effect = this.context.createConvolver();

    this.reverbTime = reverbTime;

    this.attack = 0.0001;
    this.decay = 0.1;
    this.release = reverbTime / 3;

    this.preDelay = this.context.createDelay(reverbTime);
    this.preDelay.delayTime.setValueAtTime(preDelay, this.context.currentTime);

    this.multitap = [];

    for (let i = 2; i > 0; i--) {
      this.multitap.push(this.context.createDelay(reverbTime));
    }
    this.multitap.map((t, i) => {
      if (this.multitap[i + 1]) {
        t.connect(this.multitap[i + 1])
      }
      t.delayTime.setValueAtTime(0.001 + (i * (preDelay / 2)), this.context.currentTime);
    })

    this.multitapGain = this.context.createGain();
    this.multitap[this.multitap.length - 1].connect(this.multitapGain);

    this.multitapGain.gain.value = 0.2;

    this.multitapGain.connect(this.output);

    this.wet = this.context.createGain();

    this.input.connect(this.wet);
    this.wet.connect(this.preDelay);
    this.wet.connect(this.multitap[0]);
    this.preDelay.connect(this.effect);
    this.effect.connect(this.output);

  }
  renderTail() {

    const tailContext = new OfflineAudioContext(2, this.context.sampleRate * this.reverbTime, this.context.sampleRate);
    tailContext.oncomplete = (buffer) => {
      this.effect.buffer = buffer.renderedBuffer;
    }
    const tailOsc = new Noise(tailContext, 1);
    const tailLPFilter = new Filter(tailContext, "lowpass", 5000, 1);
    const tailHPFilter = new Filter(tailContext, "highpass", 500, 1);

    tailOsc.init();
    tailOsc.connect(tailHPFilter.input);
    tailHPFilter.connect(tailLPFilter.input);
    tailLPFilter.connect(tailContext.destination);
    tailOsc.attack = this.attack;
    tailOsc.decay = this.decay;
    tailOsc.release = this.release;

    tailContext.startRendering()

    tailOsc.on({ frequency: 500, velocity: 1 });
    setTimeout(() => {
      tailOsc.off();
    }, 1)
  }

  set decayTime(value) {
    let dc = value / 3;
    this.reverbTime = value;
    this.release = dc;
    this.renderTail();
  }
}


let Audio = new (window.AudioContext || window.webkitAudioContext)();

let filter = new Filter(Audio, "lowpass", 50000, 0.8);
filter.setup();
let verb = new SimpleReverb(Audio);
verb.decayTime = 0.8;
verb.wet.gain.value = 2;


let compressor = Audio.createDynamicsCompressor();
compressor.threshold.setValueAtTime(-24, Audio.currentTime);
compressor.knee.setValueAtTime(40, Audio.currentTime);
compressor.ratio.setValueAtTime(12, Audio.currentTime);
compressor.attack.setValueAtTime(0, Audio.currentTime);
compressor.release.setValueAtTime(0.25, Audio.currentTime);
compressor.connect(Audio.destination);

filter.connect(verb.input);
verb.connect(compressor);



function useDebounce(value, delay) {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(
    () => {
      // Update debounced value after delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      // Cancel the timeout if value changes (also on delay change or unmount)
      // This is how we prevent debounced value from updating if value is changed ...
      // .. within the delay period. Timeout gets cleared and restarted.
      return () => {
        clearTimeout(handler);
      };
    },
    [value, delay] // Only re-call effect if value or delay changes
  );

  return debouncedValue;
}


function App() {

  const [token, setToken] = useState('');
  const [isLoggedIn, setLoggedIn] = useState(false);

  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([])
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebounce(query, 500);

  const [activeSong, setActiveSong] = useState(null);
  const [sound, setSound] = useState(null);
  const [speed, setSpeed] = useState(1);

  // fetch the Spotify API token from the URL params.
  useEffect(() => {
    let urlstring = window.location.href;
    let url = new URL(urlstring);
    let c = url.searchParams.get('access_token');


    if (c) {
      setLoggedIn(true);
      setToken(c);
    }
  }, [])

  const searchSpotify = (q) => {
    return fetch(`https://api.spotify.com/v1/search/?q=${q}&type=track`, {
      method: 'GET',
      headers: new Headers({
        'Authorization': `Bearer ${token}`,
      }),
    })
      .then(res => res.json())
  }

  // Effect for API call 
  useEffect(
    () => {
      if (debouncedQuery) {
        setIsSearching(true);
        searchSpotify(debouncedQuery).then(results => {
          setIsSearching(false);
          console.log(results.tracks.items)
          setTracks(results.tracks.items);
        });
      } else {
        setTracks([]);
      }
    },
    [debouncedQuery] // Only call effect if debounced search term changes
  );

  const playSong = () => {
    sound.play();
  }

  const stopSong = () => {
    sound.pause();
  }

  useEffect(
    () => {
      if (activeSong != null) {
        let s = new Sample(Audio);
        s.load(activeSong.preview_url).then((s) => {
          s.connect(filter.input);
        });
        setSound(s);
      }
    },
    [activeSong]
  );


  const changeSpeed = (e) => {
    setSpeed(e.target.value)
    sound.buffer.playbackRate.value = speed;
  }



  return (
    <div className="container mx-auto">
      <div>
        <h1 className="text-2xl font-bold">SPOTIFY SLOWED</h1>
      </div>
      {!isLoggedIn ? <a href="http://localhost:8888/login">login</a> :
        <div className="grid grid-cols-4 gap-4">
          <div>
            <input
              className="border mt-2 w-64"
              type="text"
              placeholder="Search Spotify"
              onChange={e => setQuery(e.target.value)}
            />
            {isSearching && <div>Searching ...</div>}
            {tracks.map(result => (
              <div onClick={() => setActiveSong(result)} key={result.id} className="hover:bg-gray-200 w-64">
                <h4>{result.name}</h4>
              </div>
            ))}
          </div>
          <div className="col-span-3 mt-2">
            {activeSong &&
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <img src={`${activeSong.album.images[0].url}`} />
                  <h1 className="text-xl font-bold">{activeSong.name}</h1>
                  <h1 className="text-gray-700">{activeSong.artists[0].name}</h1>
                </div>
                <div>
                  <button onClick={() => { playSong() }} className="bg-gray-900 text-gray-100 p-4 w-full">Play</button>
                  <button onClick={() => { stopSong() }} className="bg-gray-900 text-gray-100 mt-2 p-4 w-full">Pause</button>
                  <div className="flex flex-col mt-4">
                    <span className="text-sm leading-5 font-semibold tracking-wider text-gray-700 uppercase">{`speed: ${speed}`}</span>
                    <input onChange={(e) => { changeSpeed(e) }} type="range" min=".3" max="2" step=".05" value={speed} />
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  );
}

export default App;
