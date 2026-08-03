# Changelog — fauxplane

Newest first. Every entry says which KIND of release it is: VERSION (changes
what the app IS — Noah's call), CAPABILITY (it can do something it could not),
or ITERATION (a refinement or fix). The number is
`version.capability.iteration`, and it is the same triplet shown on screen and
used for the offline cache.

## 1.5.1 — ITERATION — 2026-08-03

**Leaning the phone no longer launches the horizon.** The accelerometer
measures gravity plus every push of the hand holding it; leaning swings that
measurement far further than the phone actually rotated, while its strength
stays near one g — so the old "is it about one g" check never noticed. The
gyro can tell the difference, and now it does: when the two disagree by more
than ten degrees, the horizon rides the gyro and says so, then hands back to
gravity the moment they agree again.

## The gap: 0.3.0 through 1.5.0 have no entries here

Found during the 1.5.1 audit, 2026-08-03. Eleven releases shipped without
their changelog entries; the full record of each lives in NOTES.md. They are
not backfilled here because a backfilled entry would look contemporaneous with
its release, and this file does not lie about when it knew things.

## 0.2.4 — ITERATION — 2026-08-02

**The vertical speed indicator went to 2,000 feet per minute and an airliner
beats that on the way up.** It pegged for the most interesting part of a real
flight — the part somebody is actually watching. It now reads to 6,000 either
way, which is what a transport-category display shows, and the scale is
compressed towards the ends so a gentle 500 foot-per-minute climb still moves
the needle nearly a third of the way.

## 0.2.3 — ITERATION — 2026-08-02

**A new version would not appear until you reloaded twice.** The offline cache
was being searched across every release the device had ever stored, oldest
first, so a reload fetched the new page and then ran the previous release's code
behind it — including the version number in the corner. It looked exactly like
nothing had been deployed.

The cache now only ever answers from the release it belongs to, and when a new
version does take over it refreshes the page itself, so one reload is enough.

## 0.2.2 — ITERATION — 2026-08-02

**The artificial horizon was upside down on iPhone and iPad.** Ground on top,
sky underneath. Safari reports the accelerometer with the opposite sign to every
other browser — a long-standing difference, and one no feature test can ask
about. The panel now works out which way round this device reports it, by
comparing the accelerometer against the tilt sensor, and says which it found on
the built-in test page. It is measured on the device, not guessed from the
browser's name.

**The panel was squashed into a strip on a landscape tablet in Safari.** A short,
wide window is a landscape tablet — the way this is meant to be mounted — and it
was being treated like a narrow phone and stacked into a letterbox. It now keeps
the instrument layout and takes the height back from the surrounding chrome
instead. Adding it to the home screen removes the browser's own bars entirely
and is still the best way to run it.

## 0.2.1 — ITERATION — 2026-08-02

Four fixes, all found by Noah opening 0.2.0 on his phone. Nothing here is new;
it is things that were supposed to work.

**The altimeter could never show a number.** Indicated and pressure altitude
were being timed from the weather observation they came from — and a weather
report is always several minutes old, while those readings expect to update
every minute. So they expired the instant they were worked out, every time. The
altitude readings now keep their own timing, and still go stale when the weather
behind them does.

**The horizon never came to life.** The check for whether the artificial horizon
had settled was measuring the shake of a hand holding the phone, so it never
settled. It now measures whether the horizon is actually pointing the wrong way,
which is the thing that was meant.

**And it was pointing the wrong way.** The roll axis of the motion sensor was
being read backwards, so the two halves of the horizon pulled against each other
continuously. Also fixed: on a device clamped sideways — which is how this is
meant to be mounted — one half of the horizon was ignoring the rotation
entirely.

**Winds aloft gave up too early.** On the first GPS fix the panel asked for winds
before it had finished writing the fix down, decided it had no position, and
then waited a quarter of an hour before trying again.

Smaller things: the built-in test page listed battery and network twice each; a
calm wind now reads CALM rather than "000° / 0 kt"; and one explanation on that
page was three times longer than it needed to be.

## 0.2.0 — CAPABILITY — 2026-08-02

The first release to reach production. A phone or tablet clamped where an
instrument panel would be now shows a working glass cockpit.

**The panel.** An artificial horizon with a pitch ladder, roll scale, slip/skid
ball and turn needle; groundspeed and altitude tapes; vertical speed; a G-meter
with peak hold; and a heading tape carrying a track bug. Every number on it also
appears beside the panel as real, selectable text.

**Altitude above sea level**, with no network at all. GPS reports height above a
mathematical shape that sits about 105 feet from sea level here; the panel now
carries the real thing, and the tape always names which of three altitudes you
are reading.

**A compass that agrees with the chart.** Magnetic declination — about 13
degrees east here — so magnetic and true headings can be reconciled. Checked
against the model publisher's own test values at a hundred points worldwide.

**Live weather.** The nearest station that actually reports an altimeter
setting, with its distance shown so you can judge it, and the raw observation.
The Kollsman window is a real control: dial it and the indicated altitude moves
the way a real altimeter would.

**A built-in test page** listing every sensor and feed with a plain reason. Deny
every permission and the app still loads, every instrument flags correctly, and
this page explains each one.

**Nothing on this panel is invented.** Every value says where it came from, and
a reading that is missing says so instead of showing a number.

Also: installs as a PWA, holds a wake lock, locks to landscape, runs offline for
the instruments that need no network, and dims between two brightness settings
that have both been measured for readability.

Known and shown on the built-in test page rather than hidden: the airport
database is not bundled, because nothing on any current page uses it and its
terms of use could not be read.
