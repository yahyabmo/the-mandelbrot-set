/**
 * GLSL for WebGL2. The iteration follows src/math/mandelbrot.ts line for line, so that
 * the tests of the CPU version also vouch for these shaders.
 */

export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

const ITERATE = `
uniform vec2 uSize;       // target size in pixels
uniform float uPixel;     // complex units per target pixel
uniform vec2 uCenter;     // view centre, used by the direct path only
uniform vec2 uJitter;     // sub-pixel offset of this sample
uniform int uMaxIter;
uniform int uPerturb;     // 0: direct float32, 1: perturbation around the reference orbit
uniform sampler2D uOrbit; // reference orbit Z_0..Z_n as RG32F, 4096 per row
uniform int uOrbitLen;

const float BAILOUT2 = 65536.0;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 orbitAt(int k) { return texelFetch(uOrbit, ivec2(k & 4095, k >> 12), 0).xy; }
float smoothCount(int i, float r2) { return float(i) - log2(log2(r2)) + 4.0; }

/** Continuous iteration count of the sample, or -1 inside the set. */
float iterate() {
  vec2 offset = (gl_FragCoord.xy + uJitter - 0.5 * uSize) * uPixel;
  if (uPerturb == 0) {
    vec2 c = uCenter + offset;
    vec2 z = vec2(0.0);
    for (int i = 0; i < uMaxIter; i++) {
      z = cmul(z, z) + c;
      float r2 = dot(z, z);
      if (r2 > BAILOUT2) return smoothCount(i, r2);
    }
    return -1.0;
  }
  // dz <- 2 Z dz + dz^2 + dc, z = Z + dz, rebasing to the start of the orbit when needed.
  vec2 dz = vec2(0.0);
  int m = 0;
  for (int i = 0; i < uMaxIter; i++) {
    vec2 Z = orbitAt(m);
    dz = 2.0 * cmul(Z, dz) + cmul(dz, dz) + offset;
    m++;
    vec2 z = orbitAt(m) + dz;
    float r2 = dot(z, z);
    if (r2 > BAILOUT2) return smoothCount(i, r2);
    if (r2 < dot(dz, dz) || m == uOrbitLen) {
      dz = z;
      m = 0;
    }
  }
  return -1.0;
}
`;

const COLOUR = `
uniform sampler2D uPalette; // sRGB texels, read back as linear light
uniform float uPeriod;
uniform float uOffset;
uniform int uMirrored;
uniform vec3 uInterior;     // linear

vec3 colourOf(float v) {
  if (v < 0.0) return uInterior;
  float t = v / uPeriod + uOffset;
  float u = uMirrored == 1 ? fract(t * 0.5) * 2.0 : fract(t);
  if (u > 1.0) u = 2.0 - u;
  return texture(uPalette, vec2(u, 0.5)).rgb;
}
`;

/** Writes the continuous iteration count, for the base image of the view. */
export const COUNT = `${HEADER}${ITERATE}
out vec4 outValue;
void main() { outValue = vec4(iterate(), 0.0, 0.0, 1.0); }`;

/** Writes the colour of one jittered sample, added up in the accumulation buffer. */
export const SAMPLE = `${HEADER}${ITERATE}${COLOUR}
out vec4 outColour;
void main() { outColour = vec4(colourOf(iterate()), 1.0); }`;

/** Colours a count texture into linear light, for the first accumulated sample. */
export const COLOURIZE = `${HEADER}${COLOUR}
uniform sampler2D uCounts;
out vec4 outColour;
void main() { outColour = vec4(colourOf(texelFetch(uCounts, ivec2(gl_FragCoord.xy), 0).r), 1.0); }`;

/** Puts the image on screen: either a count texture coloured on the fly, or the accumulated average. */
export const DISPLAY = `${HEADER}${COLOUR}
uniform vec2 uScreen;
uniform sampler2D uCounts;
uniform vec2 uCountsSize;
uniform sampler2D uAccum;    // colour sums, with the number of samples in alpha
uniform float uSamples;      // 0: show the counts
out vec4 outColour;

vec3 toSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

vec3 countsColour(vec2 uv) {
  // Bilinear blend of the colours, not of the counts: a lower-resolution image stays smooth.
  vec2 p = uv * uCountsSize - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 hi = ivec2(uCountsSize) - 1;
  vec3 c00 = colourOf(texelFetch(uCounts, clamp(i, ivec2(0), hi), 0).r);
  vec3 c10 = colourOf(texelFetch(uCounts, clamp(i + ivec2(1, 0), ivec2(0), hi), 0).r);
  vec3 c01 = colourOf(texelFetch(uCounts, clamp(i + ivec2(0, 1), ivec2(0), hi), 0).r);
  vec3 c11 = colourOf(texelFetch(uCounts, clamp(i + ivec2(1, 1), ivec2(0), hi), 0).r);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uScreen;
  // Each pixel divides by its own count: a sample computed in bands is only partly there.
  vec4 a = texture(uAccum, uv);
  vec3 c = uSamples > 0.0 ? a.rgb / max(a.a, 1.0) : countsColour(uv);
  outColour = vec4(toSrgb(clamp(c, 0.0, 1.0)), 1.0);
}`;
