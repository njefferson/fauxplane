/**
 * releases.js — what changed, in one place (Doctrine §7d).
 *
 * THE READER IS NOT A DEVELOPER. He is building a 747 cockpit in his house and
 * he loves planes. Every line here is written for him: what he can now see or
 * do, not what was refactored. "Fixed the residual-based accelerometer
 * rejection" is not a patch note. "Leaning the phone no longer makes the
 * horizon look like a rocket launch" is.
 *
 * THIS IS THE ONLY PLACE RELEASE NOTES ARE WRITTEN. The version stamp, the
 * service-worker cache and this list all resolve to `VERSION` in `version.js` —
 * `releases.test.mjs` fails the build if the newest entry here is not that
 * version, because notes typed twice eventually describe a build that shipped
 * something else.
 *
 * `broken` IS NOT OPTIONAL AND IS NOT A CONFESSION. Doctrine §7d requires every
 * release to say what is still wrong, in the app, where the reader will find it.
 * A panel that only lists wins teaches him to distrust the wins. An entry with
 * nothing outstanding uses an empty array and says so on screen.
 *
 * ---------------------------------------------------------------------------
 * "YOU" IS THE READER. THERE IS NO "I". AND NOBODY IS ASKED TO SEND ANYTHING.
 * ---------------------------------------------------------------------------
 *
 * Rewritten wholesale on 2026-08-05, because ten releases had drifted into
 * being a support thread published inside the product. Noah, on opening What's
 * New: "WHAT THE *FUCK* ARE THESE RELEASE NOTES?!"
 *
 * Three failures, each of which reads as perfectly reasonable while writing it:
 *
 *   · "YOU" QUIETLY BECAME THE PERSON WHO REPORTED THE BUG. "You asked why every
 *     runway looks the same." "You held the panel up next to your home screen."
 *     "You sent a photo of DAL2229." "Five things you said were wrong." The
 *     reader is not that person. He opens this list and is addressed as someone
 *     else, about events he was not present for.
 *
 *   · "I" APPEARED AT ALL. "I measured both." "It covers exactly what I cannot
 *     reach from here." "I only wrote the test AFTER you found it. That is
 *     backwards." A session narrating its own process, in someone else's app,
 *     to a stranger. There is no author character in a patch note. The panel
 *     changed; say what it does now.
 *
 *   · THE READER WAS GIVEN HOMEWORK, in eight consecutive releases. "Send me
 *     that." "Follow a flight and send the report." "That is the thing to send
 *     me." Telling a reader HOW to report a problem is Doctrine §7e and belongs
 *     in the (i) menu. Making the next release conditional on him doing it is a
 *     working arrangement between two other people, leaking onto his screen.
 *
 * The tell they share: a note written from the SESSION's memory of the week
 * rather than from the diff. What was fixed is reader material. Who found it,
 * how it felt to find, and what is owed next are not.
 *
 * Raw protocol goes the same way — HTTP 201, `content-type`, `cf-ray`, "24
 * pixels", "below the fold". The diagnostics report is where that lives, and it
 * is one press away. `releases.test.mjs` fails the build on all of it.
 *
 * The rule was in this header the whole time and ten releases went past it, so
 * it is a GATE now rather than a paragraph.
 */

/**
 * Newest FIRST. Each entry:
 *   version  the release, matching version.js for the newest
 *   date     ISO day it shipped
 *   headline one short line — what this release IS, in his words
 *   changed  what he can now see or do
 *   broken   what is still wrong, that he might hit
 */
export const RELEASES = [
  {
    version: '1.28.3',
    date: '2026-08-05',
    headline: 'On a phone held sideways, the instruments get the whole screen.',
    changed: [
      'The PFD in landscape used to end with a row of value text sliced through the middle, sitting just above the footer. The instruments now fill the screen and the written values start below it — scroll down for them, or do not, and nothing is cut in half.',
      'The scope is a quarter wider for it. The four range buttons stack into a single narrow column beside it instead of sitting in a square block, and the circle gets the room that block was using.',
      'The horizon is taller too, by about the height of the row that used to be wasted on a fragment of text.',
    ],
    broken: [
      'The written values are still there and still complete — they are simply below the instruments now. On a very short screen there is no arrangement that shows both, and the instruments are what a panel is for.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'A followed flight shows no route. See 1.27.0.',
    ],
  },
  {
    version: '1.28.2',
    date: '2026-08-05',
    headline: 'Brightness moves to SETUP, and the (i) moves up beside the tabs.',
    changed: [
      'Brightness now sits on the SETUP page with the levelling controls. It is a choice made once for wherever the panel is standing, and it was holding a place in the top bar that it did not need.',
      'It has room to explain itself there. The panel has two measured colour schemes rather than a brightness slider — a dimmed screen is a screen whose text has quietly lost its contrast, and a real flight deck changes the lighting rather than fading the glass. On Auto it follows the device\u2019s light sensor where there is one, and the sun\u2019s computed elevation where there is not.',
      'The (i) button now rides the row of page tabs, instead of sharing a box below them with brightness. Same button, same menu behind it.',
    ],
    broken: [
      'At 200% text on a small phone the RADAR scope still starts off the bottom of the screen, and moving these two controls did not change that. What fills the screen at that size is the row of five page tabs, each one at the minimum size a finger can reliably hit.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'A followed flight shows no route. See 1.27.0.',
    ],
  },
  {
    version: '1.28.1',
    date: '2026-08-05',
    headline: 'What’s new is about the panel again, not about building it.',
    changed: [
      'These notes had turned into a developer’s diary. Half of them addressed whoever reported a fault rather than whoever is reading, several asked the reader to go and send a report back, and a few printed server replies and pixel measurements. Every release below is rewritten to say what the panel does and what it still gets wrong. No claim changed and nothing was dropped — the same releases, described from the other side of the screen.',
      'What belongs here: what can now be seen or done, and what is still wrong with it. What does not: how any of it was found. The diagnostics report behind the version stamp holds all of that and is one press away.',
    ],
    broken: [
      'At 200% text on a small phone the RADAR scope still starts off the bottom of the screen and has to be scrolled to. At that size the header and the row of tabs alone fill two thirds of the screen before the page begins.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'A followed flight shows no route. See 1.27.0.',
    ],
  },
  {
    version: '1.28.0',
    date: '2026-08-05',
    headline: 'The radar page, five ways it was getting in the way.',
    changed: [
      'The scope is at the top of the page. The airport picker used to sit above it and push the instrument down — on a phone the radar began past the half-way mark and ran off the bottom. The picker aims the scope once, so it lives below it now. Range and altitude band stay above, because those are read while looking at the scope.',
      'The four ranges fit on one line, and so do the four altitude bands. Each used to wrap onto a second row on a phone, costing the scope two more rows of height.',
      'The range rings are labelled with the distance they are actually at. On the 10 nm scope the inner rings sit at 2.5 and 7.5 miles and used to read 3 and 8. The wider ranges divide evenly, which is how it went unnoticed.',
      'Tapping an aircraft works where the eye goes. The callsign and height beside a symbol are the big readable part, and that is what a finger aims at — but the tap area stopped just short of the label, so it worked sometimes and not others. It reaches the label now.',
      'Tapping an aircraft in the list does the same as tapping it on the scope: it fills the flight number into the box as well as following it.',
      'Pressing "Follow this flight" answers right under the button. It always answered — at the top of the page, out of sight from the button at the bottom. An empty box now says what to type instead of saying nothing.',
    ],
    broken: [
      'At 200% text on a small phone the scope still starts off the bottom of the screen. This page more than halved its own share of that, but at that size the header and the row of tabs alone fill two thirds of the screen.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'A followed flight shows no route. See 1.27.0.',
    ],
  },
  {
    version: '1.27.0',
    date: '2026-08-05',
    headline: 'The route is switched off, and this is why.',
    changed: [
      'A followed flight no longer tries to show its route. The service that publishes routes never actually receives the request — it is stopped at the edge of their network and answered with an empty page, the same way the second aircraft feed turns this app away.',
      'Every one of those attempts spent part of the same allowance the RADAR needs. The aircraft are the instrument and a route is a nicety, so the asking stopped and the aircraft got the allowance back.',
      'Nothing was removed. If that service ever starts letting the request through, the route comes back on with one switch.',
      'The self test on the BITE page no longer reports the weather feed as failed while the weather is plainly working two lines above it. It had been asking in the wrong form.',
      'The diagnostics report says how many times the panel has been put in the background, and when. Sensors stop while an app is in the background, so "no update for 3 seconds" was describing a clock rather than a cause.',
    ],
    broken: [
      'A followed flight shows no route — now for a known reason rather than an unknown one.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
    ],
  },
  {
    version: '1.26.0',
    date: '2026-08-04',
    headline: 'One press, and the panel checks everything it can reach.',
    changed: [
      'BITE has a "Run the self test" button. One press asks every feed once and reports what this device can and cannot do: its sensors, what the screen really is, what the offline copy is holding, and each feed through the real servers.',
      'The result goes into the diagnostics report automatically, so one copy carries everything.',
      'It tells apart "did not ask" from "asked and got nothing". With no flight followed, the route check says SKIPPED rather than making up a callsign to ask about — asking about an invented aeroplane would break the same rule as inventing a reading.',
      'Anything it cannot determine says so, rather than quietly counting as fine.',
    ],
    broken: [
      'A followed flight still shows no route.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
    ],
  },
  {
    version: '1.25.1',
    date: '2026-08-04',
    headline: 'Runways stop being identical hairlines, and airports get their own mark.',
    changed: [
      'Every runway used to be drawn the same width, at every range and at every airport — it had never once varied since the day it shipped. Width now rises with the runway\u2019s drawn size.',
      'And at 40 or 80 miles a real runway is only a few pixels long. Drawn honestly it is a speck; drawn bigger it would be a lie about a distance. So below the size where a line can actually show a DIRECTION, it becomes a small circle — the airport symbol every aeronautical chart uses — one per airport rather than one per runway.',
      'Zoom in and the circles become real runways again, where they are, pointing where they point. That is what a real navigation display does.',
    ],
    broken: [
      'A followed flight still shows no route.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
    ],
  },
  {
    version: '1.25.0',
    date: '2026-08-04',
    headline: 'The panel checks that the aeroplane it was handed is the one it asked for.',
    changed: [
      'When the panel asked the feed about one aircraft, it accepted whatever came back without checking it really was that aircraft. Real numbers, real timestamps, honest-looking provenance — and possibly the wrong aeroplane, with nothing on screen to say so.',
      'It now refuses a broadcast that is not about the aircraft being followed, and says so instead of showing it.',
    ],
    broken: [
      'A followed flight still shows no route.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
    ],
  },
  {
    version: '1.24.1',
    date: '2026-08-04',
    headline: 'The panel records who answered when a route cannot be shown.',
    changed: [
      'When a route does not appear, the diagnostics report now records where the reply really came from: the final address, whether the request was redirected on the way, and which server answered. Enough to tell the possibilities apart rather than guess between them.',
    ],
    broken: [
      'A followed flight still shows no route, and why is not yet known.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
    ],
  },
  {
    version: '1.24.0',
    date: '2026-08-04',
    headline: 'A followed flight stops carrying the last one\u2019s name.',
    changed: [
      'Switching from one aircraft to another left the previous one\u2019s name in the readings — following one registration while the heading still named a different one as the aircraft not broadcasting. Every field is cleared on a switch now.',
      'The diagnostics report says when the route block is about a different aircraft than the one being followed, instead of quietly showing the last one.',
      'The route request itself is accepted by the feed, so the request is not the thing that is wrong. The report now carries the actual reply, its size and its type.',
    ],
    broken: [
      'A followed flight still shows no route.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'The browser console shows repeated "ResizeObserver loop" warnings on iPad. They are noise from the layout settling, not a fault, and they are not fixed.',
    ],
  },
  {
    version: '1.23.1',
    date: '2026-08-04',
    headline: 'The icon at the top of the panel is the app’s own icon.',
    changed: [
      'The icon in the (i) menu was a hand-drawn copy of the app icon rather than the icon itself — the horizon level instead of banked, no dark plate around it, no pitch ladder, no outline on the aircraft symbol. Same idea, different drawing.',
      'It is the real icon file now: the exact one on the home screen and in the browser tab, not a copy of it. There is only one of it, so it cannot drift again.',
      'A check fails the build if those ever stop being the same file. Resembling the icon is not good enough.',
    ],
    broken: [
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands.',
      'A followed flight still shows no route.',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-08-04',
    headline: 'The radar counts down instead of saying "a moment".',
    changed: [
      'When the scope is waiting, the indicator shows a countdown: NO CONTACT · RETRY 12s, ticking down to the next sweep. A wait with no number just looks broken, and the app knew the number the whole time without ever saying it.',
      'It counts down to when the panel will ASK, not to when the radar will work. Those are different promises and only the first can honestly be made — the next answer might be another refusal. Either way it is visible: the attempt, and what came back.',
      'An ageing scope counts down too, and the aircraft on it stay tappable while it does.',
      'The stand-off message now shrinks as the wait does. It used to say "standing off for up to 600s" for the whole ten minutes, including the last thirty seconds of it. It now says how much is actually left.',
    ],
    broken: [
      'The countdown cannot tell you when the feed will start answering, only when the panel will next try. Nothing on this device knows the first one.',
      'The rate limiting itself is unchanged and is not being fixed; the note in 1.20.0 still stands.',
      'A followed flight still shows no route.',
    ],
  },
  {
    version: '1.22.1',
    date: '2026-08-04',
    headline: 'Two things the panel was saying that were not true.',
    changed: [
      'The panel could report that the heading had failed because "this device reports no magnetic heading" while the same report showed the compass reading 278.3 degrees a few lines further down. The compass was there — it had simply stopped sending updates while the page was in the background. The panel now says which of those two it is, and shows the last reading it actually had.',
      'That distinction matters more than it sounds. A wrong number looks wrong. A confident wrong sentence sends someone off to fix hardware that works.',
      'The FOLLOWING banner said "this panel is showing that aircraft\u2019s broadcast, not this device" from the moment follow was pressed — including when the feed was rate limited and no broadcast ever arrived. It was showing nothing, while a line at the top of a panel full of red crosses claimed it had data.',
      'It now says "no broadcast received yet" until one actually arrives, and gives the feed\u2019s own reason when there is one. Same aircraft, same crosses, but the panel is no longer arguing with itself.',
    ],
    broken: [
      'Rate limiting is unchanged. If the feed will not answer, following an aircraft still gives a crossed-out panel — the difference is that it now says why instead of claiming otherwise.',
      'A followed flight still shows no route.',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-08-04',
    headline: 'The panel stops crossing itself out while a flight is being followed.',
    changed: [
      'Following a flight could cross out every instrument at once — speed, G, attitude, altitude, vertical speed, heading — with the power on and the feed working. That was arithmetic rather than a broken feed, and it is fixed.',
      'Each reading has a limit on how long it stays believable before the panel refuses to show it. Those limits were set for this device\u2019s own sensors, which report many times a second. Heading\u2019s limit was five seconds — and a followed aircraft is asked once every ten. The number was dead before the next one could possibly arrive, every single time.',
      'The aircraft\u2019s readings now age on the aircraft\u2019s own clock: still shown, still honest about how old they are, but no longer declared dead a moment after they arrive. Nothing is invented and nothing is held longer than it should be — a followed flight goes STALE, and then FAIL, only when the feed has genuinely stopped.',
      'THE RADAR NOW SAYS WHAT STATE IT IS IN, above the scope. LISTENING before the first sweep. CONTACT with a count once aircraft are on it. AGEING when the feed has stopped answering but the aircraft shown are still real ones. NO CONTACT — which means two different things, so it says which: nothing in range, or the feed will not answer.',
      'The indicator also says when a tap will actually do something. That is a separate fact from the scope being full, which is why it is shown separately: an ageing scope is still tappable, and a fresh sweep over an empty sky is not.',
    ],
    broken: [
      'A followed flight still shows no route.',
      'The aircraft feed is still turned away sometimes; the note in 1.20.0 stands. AGEING on the indicator is that, named.',
      'Following an aircraft still crosses out pitch, slip, true and indicated airspeed, and indicated altitude. That is correct and is not this defect — ADS-B does not carry them, and the panel will not invent them.',
    ],
  },
  {
    version: '1.21.1',
    date: '2026-08-04',
    headline: 'The route feed was quietly eating the radar’s allowance. Fixed.',
    changed: [
      'Tapping the radar to follow an aircraft appeared to have stopped working. The tapping was fine — there was nothing on the scope to tap, and that is what 1.21.0 broke.',
      'The route feature talks to adsb.lol, which is the same service the aircraft feed uses. When a service turns us away, the panel is supposed to stop asking it for a while. That stand-off was being recorded separately for the route feed — which sounds careful and is the opposite, because their limit counts every request from this app together rather than per feature.',
      'So a refusal earned by asking for a route never told the aircraft feed to back off, and the aircraft feed kept asking, and got refused. The route is a nicety; the aircraft ARE the instrument. One stand-off now covers the whole service.',
      'The panel also will not ask for a route at all while the aircraft feed is being refused. Spending the next request on a line of text instead of on the contents of the radar is the wrong trade.',
    ],
    broken: [
      'If the scope was empty before this version, give it a few minutes — any stand-off already recorded has to expire on its own.',
      'A followed flight still shows no route.',
      'The underlying rate limiting is unchanged and is not being fixed; the note in 1.20.0 still stands.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-08-04',
    headline: 'The flight you are following says where it is going.',
    changed: [
      'Follow an aircraft and the banner shows its route — KSFO → KJFK, and every stop in between if it has any. A flight plan in the smallest form that is honest.',
      'It says PLAUSIBLE right next to it, and that word is not decoration. adsb.lol work the route out from the callsign — UAL328 flies the sector United usually fly it on — which is a good guess and is not a filed flight plan. The aircraft could be diverting, repositioning, or flying something else entirely under a reused callsign. The panel will not present a guess as a clearance.',
      'It is asked once per flight, not once per sweep. Following one aeroplane for an hour costs the volunteers who run this service a single request.',
      'The (i) menu now lists the route feed alongside every other source, with its licence and a link to its terms.',
    ],
    broken: [
      'THE ROUTE MAY NOT APPEAR AT ALL ON THIS RELEASE, and if it does not, that is expected rather than a fault. The exact shape of the request this feed wants is not published anywhere this session could read, so the panel sends its best-reasoned guess. If the guess is wrong the route simply reads as unavailable — it will never show a made-up one.',
      'When it does not appear, the diagnostics report behind the version stamp records exactly what came back, including the field the feed rejected if it rejected one.',
      'There is still no map. The route is two airport codes rather than a drawn line.',
      'The rate limiting is unchanged and is not being fixed; the note in 1.20.0 still stands.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-08-04',
    headline: 'The radar explains itself in English when the feed says no.',
    changed: [
      'When the aircraft feed turns us away, the panel says so in a sentence instead of printing the raw server reply. It used to put the refusal codes, the internal trace identifiers and both services\u2019 names straight onto the gauge. Every word of that was true and none of it was for a reader.',
      'It says WHY when the cause is actually known: the panel reaches these services through Cloudflare, whose address is shared with a great many other sites, so the allowance can be spent by traffic that has nothing to do with you. When the cause is not known it does not guess.',
      'It says what is still true on screen — that the aircraft drawn are the last ones really heard and are ageing — because a stale scope and an empty sky mean completely different things.',
      'Nothing is hidden. The full server reply is still in the diagnostics report behind the version stamp, and on a long-press of the status line. Simplifying an error is help; hiding one is not.',
    ],
    broken: [
      'The rate limiting itself is not fixed and will not be. The only thing that would fix it is running a receiver to earn an API key tied to you rather than to a shared address, and that is hardware. Decided against on 2026-08-04, so the panel is now built to live with it rather than waiting for it to be solved.',
    ],
  },
  {
    version: '1.19.2',
    date: '2026-08-04',
    headline: 'The panel stops knocking on a door it knows is locked.',
    changed: [
      'When an aircraft source refuses us, the panel now waits before asking it again instead of trying on every single request. adsb.fi has been refusing every attempt — their firewall blocks us before their servers ever see it — and their published terms say a refused request counts toward getting the address temporarily banned. So every fetch was spending a strike on a call that could never work.',
      'The wait is as long as the service asks for. A rate limit that says "come back in five minutes" gets five minutes; a firewall block gets ten, because that is a decision about who we are and will not have changed in thirty seconds.',
      'The radar says "not asked — standing off" rather than pretending it tried. Being turned away and choosing not to ask are different facts and you should be able to tell which happened.',
    ],
    broken: [
      'This is politeness, not a fix. The first-request rate limiting is still there: the panel reaches these services through Cloudflare, whose address is shared with an enormous number of other sites, so the allowance can already be spent by traffic that has nothing to do with you.',
      'Both services say the same thing about the real answer — feed them. A receiver at your house earns an API key tied to you rather than to a shared address, and that is the thing that would actually fix it.',
    ],
  },
  {
    version: '1.19.1',
    date: '2026-08-03',
    headline: 'Landscape gets its instruments back.',
    changed: [
      'On a landscape iPad the strip of values was taking a THIRD of the screen and still cutting off mid-row, which squashed the horizon into a letterbox. Each value is one line now instead of three, so the strip is a fifth of the height and the horizon and the radar are both about twenty percent bigger.',
      'The reading sits against the right edge of each row, so a column of them lines up and can be read down without reading the labels.',
      'A failing value still gets its own line for the reason. That text is the entire point of a crossed-out row and is never the thing that gets squeezed.',
    ],
    broken: [
      'With everything crossed out — no permissions granted — every row carries a reason and the strip scrolls. That is the worst case and it is meant to look like that; with live readings most rows are a single line.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-08-03',
    headline: 'Runways on the scope, and the horizon recovers twice as fast.',
    changed: [
      'Airports now show their RUNWAYS on the radar — the real thresholds, where they actually are and pointing where they actually point. Centre the scope on an airport and drop to 10 nm to see the layout with real traffic moving over it.',
      'GENTLE ROTATION NO LONGER ERRORS THE HORIZON, and this one is a real fix rather than a workaround. Turning the panel while it is tilted — in a cradle, on a desk, in the hand — used to invent roll that was not happening: about ten degrees of it at a ten-degree tilt, and fifty at sixty, from three seconds of slow turning. The maths that carries the gyro forward was using a shortcut that is only exact when the panel is bolt upright, and it now uses the full relations.',
      'The filter also trusts the gyro for half as long before the accelerometer wins, so if anything does knock it off it comes back in well under a second instead of four.',
      'Aircraft on the ground no longer appear as traffic below you. A real flight deck does not show parked aeroplanes, and an airport ramp was filling the BELOW band. ALL still shows them, because that one is marked as ours rather than a real setting.',
      'The aircraft list says how many there are and how many are still further down. It always scrolled; nothing on screen said so.',
      "What's new shows the last three releases and puts the rest behind one press, instead of every version ever, forever.",
      'The welcome screen leads with the instrument instead of a wall of grey text.',
      "A link to the rest of Noah's apps, in the (i) menu and in the footer.",
    ],
    broken: [
      'The horizon fix is verified against the maths rather than against hardware. If it still misbehaves, press the version stamp WHILE it is wrong — that report is what makes a cause findable.',
      'Held in a hand the panel never goes properly still, so it stays at COARSE quality and never declares itself converged. That is honest rather than broken, but it means a hand-held panel has neither of the two things that normally rescue a drifting horizon.',
      'Runways are drawn without their identifiers. Adding labels risks the overprinting smear the aircraft labels already had to be rescued from.',
      'The runway data is Northern California only, like the airports.',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-08-03',
    headline: 'The instruments get their screen back, and the panel knows where you are.',
    changed: [
      'The column of values no longer takes a third of the display. It is a strip along the bottom now, and the navigation display beside the horizon is roughly twice the size it was. Most of that column was repeating the instruments anyway — groundspeed is the GS tape, altitude is the ALT tape, vertical speed is the VS tape, heading is the compass rose.',
      'The values are all still there, still as real text you can select or have read aloud. That part was never optional; what changed is that it costs the panel a band instead of a third of the glass.',
      'The first-time instructions are shown again on a first visit. They had been moved into the (i) menu and nothing ever opened them, so a newcomer got a cockpit full of crossed-out instruments and no explanation. The panel is live behind them and closing them is all they ask.',
      'The panel remembers roughly where you were and starts there next time, instead of always starting at a fixed point in Cameron Park. Stored to about a kilometre — enough to centre a scope, not enough to be your address.',
      'The line along the bottom says what the scope is ACTUALLY centred on: your position, an airport you picked, a flight you are following, or the fallback. It used to say "Home reference Cameron Park" even while your own GPS altitude was on screen a few inches above it.',
    ],
    broken: [
      'The remembered position is only used before a fix arrives. It does not make the panel work anywhere the bundled airport list does not cover — that is still Northern California only.',
      'On a landscape phone the value strip is below the instruments and you scroll to it. There is not enough height on that shape to have both without shrinking the horizon, and the horizon wins.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-08-03',
    headline: 'The panel can now tell you it has gone out of date.',
    changed: [
      'When a new version is ready, a strip appears under the tabs saying so, with "Install it now" and "Not now". It never covers an instrument and it never installs itself — you decide when.',
      'Until you press it, you keep the panel you already had, working exactly as it was. That is deliberate: the old behaviour swapped new code in underneath a page that was still drawing the old screen, which is how you get an instrument that half-works with nothing on screen to explain it.',
      'A brand-new visitor is never shown any of this. Nothing to be behind on thirty seconds after arriving.',
      'If the panel ever gets properly stuck on an old release, the strip now says which one is available instead of silently reloading you. That silent reload is what used to happen, and you could not tell it apart from the app just blinking.',
      'The diagnostics report says which copies of the app the device is holding and whether a newer one is waiting. The version stamp alone cannot tell you that — a stale app reports its own old version perfectly honestly.',
      'A first-ever visit no longer reloads itself once for no reason.',
    ],
    broken: [
      'If you press "Not now", you are not asked again until the next time you open the panel. There is no way to bring the strip back on purpose in this release.',
      'The panel cannot tell you a new version exists while you are offline. It has to reach the network to find out, which is the honest limit of an app that works without one.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-08-03',
    headline: 'Point the radar at any airport you like.',
    changed: [
      'A box at the top of the RADAR page centres the scope wherever you want. Type SFO, or Sacramento, or a pair of coordinates, and press the one you meant — the scope moves there and the feed is re-asked about that patch of sky, so you are seeing the aircraft over that airport rather than the ones over your desk relabelled.',
      'The airports are BUILT IN — 702 of them across Northern California, from the OurAirports public-domain database. That means the picker works with the radio off, and it cannot be rate limited the way the live feed can.',
      'It ranks big airports first, so typing "san" offers San Francisco International before somebody\'s airstrip, and an exact code you already know always wins.',
      '"Back to my position" puts it back on you. Following a flight still beats both — the aircraft is what the whole panel has become.',
      'The crosshair in the middle of the scope now says what it is: YOU, HOME, the flight you are following, or the airport you picked. The navigation display on the PFD said HOME under that crosshair no matter what, including while following a 747.',
    ],
    broken: [
      'Northern California only. The bundle is cut to the region this panel is built for; an airport outside it will not be found, though its coordinates still work if you type them.',
      'Choosing an airport does not move your instruments — you are still on your desk. Only the traffic scope goes there, which is the honest answer: nothing on the phone can measure the air over Sacramento.',
      'The live aircraft feed can still turn us away on the very first request of a session, and no picker fixes that.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-08-03',
    headline: 'The radar reads like a real one now.',
    changed: [
      'Each aircraft shows its height RELATIVE to you, in hundreds of feet, with an arrow if it is climbing or descending — "+24↑" is two thousand four hundred feet above you and going up. That is exactly what a flight deck shows beside a traffic symbol, and it is all it shows.',
      'The callsign is gone from the scope, because a real one carries no callsigns. It is one tap away instead, and the "Heard right now" list still has every detail — the scope got austere, the list stayed rich.',
      'NORM, ABOVE and BELOW altitude filters, with the real numbers a flight deck uses. This is what stops fifty-six aircraft from being on one screen: a crew only ever sees a slice. ALL is marked with a star because it is ours, not theirs.',
      'The ranges are the real Boeing steps — 10, 20, 40 and 80. The old 25 was not a range any aircraft offers.',
    ],
    broken: [
      'On a desk you are at a few hundred feet, so NORM correctly hides every airliner overhead. That is what a real one would do, and why ALL is the default here.',
      'The symbol is the same shape whatever the traffic is. A real display uses a diamond, a filled diamond, an amber circle and a red square to say how close it is to being a problem — that needs closing speed, which is not in the broadcast.',
    ],
  },
  {
    version: '1.14.1',
    date: '2026-08-03',
    headline: 'Tapping an aircraft on the radar works. It never has before.',
    changed: [
      'Tapping an aircraft on the scope now follows it. It threw an error on every single tap since the feature was added seven releases ago, so it has never worked once — nothing caught it because the checks look at the screen and had never pressed anything.',
      'Power, levelling and clear are one control strip under the horizon now, instead of the power switch floating on its own row attached to nothing.',
    ],
    broken: [
      'The scope is still far more crowded than a real one, and still labels every aircraft with its callsign and absolute altitude. A real flight deck shows relative height in hundreds of feet, filters by an altitude band, and shows no callsigns at all. That is the next change.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-08-03',
    headline: 'Following a flight now centres the radar on it — and the crew readouts are real.',
    changed: [
      'Follow an aircraft and the scope centres on THAT aircraft, not on your desk. Every other instrument had already switched to it; the radar was the last thing still showing where you are standing. The caption names what the centre is, so it no longer says "within 40 nm of this device" while pointing at a 737 over the Sierra.',
      'Confirmed against a real aeroplane: a 737 MAX broadcast its selected altitude (32,992 ft), its selected heading and the altimeter setting its crew was flying to. Those three readouts had been built from published field names without a single real response ever having been seen. Now they have been.',
      'The PWR switch responds the instant it is pressed instead of waiting for the first weather fetch to finish.',
    ],
    broken: [
      'While the feed is rate limiting us, a followed aircraft stops updating and its instruments age out to crossed-out — the panel keeps its last real position rather than inventing a new one, which is right, but it means being turned away breaks following as well as the radar.',
    ],
  },
  {
    version: '1.13.3',
    date: '2026-08-03',
    headline: 'When the aircraft feed turns us away, the panel now says for how long.',
    changed: [
      'When the aircraft feed turns the panel away, it usually says how long to wait and how much allowance is left. All of that was being thrown away and replaced with a bare refusal code. It is on the gauge and in the report now.',
    ],
    broken: [
      'Being turned away on the very first request of a session is not something this app can pace its way out of. It reaches the feed through Cloudflare, which shares one address across an enormous number of sites, so the allowance can already be spent by traffic that has nothing to do with you.',
    ],
  },
  {
    version: '1.13.2',
    date: '2026-08-03',
    headline: 'The radar fills in immediately, and the report stops calling healthy things broken.',
    changed: [
      'The plan view beside the horizon asks for aircraft the moment the panel opens instead of waiting out its refresh interval. It used to sit empty for the first fifteen seconds for no reason.',
      'The diagnostics report no longer counts the followed-aircraft autopilot readouts as failures when you are not following anything. They cannot have a value on your own device — there is no autopilot to read — so they are listed as NOT APPLICABLE rather than padding the failure count.',
    ],
    broken: [],
  },
  {
    version: '1.13.1',
    date: '2026-08-03',
    headline: 'The power switch looks like equipment, and lights up when it is off.',
    changed: [
      'PWR is a switch cap now rather than another rounded button hiding among the menu controls — square, bezelled, with the legend on the face.',
      'When the panel is off, the OFF legend is LIT in amber so it draws the eye. Switched on, it goes dark and quiet. That is the way a real flight deck works: a lit annunciator means something is not normal, and nothing lights up to tell you things are fine.',
    ],
    broken: [],
  },
  {
    version: '1.13.0',
    date: '2026-08-03',
    headline: 'The diagnostics report now says what the aircraft feed actually sent.',
    changed: [
      'The report lists which fields the traffic service really provided, and on how many aircraft — so a crossed-out readout can be told apart from a field nobody is broadcasting.',
      'A "Probe the feed once" button asks the service a single time and reports the answer: the status, how long it took, and — if it is rate limiting us — exactly how long it is asking us to wait.',
    ],
    broken: [
      'Whether real aircraft broadcast the autopilot selections at all is still unknown. That readout was built from the published field names without a single real response ever having been seen; this release is how that finally gets answered.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-08-03',
    headline: 'A power switch on the panel, instead of a pop-up you had to get past.',
    changed: [
      'The app opens straight to the instruments. No dialog, nothing to accept — every instrument is honestly crossed out until you switch the panel on, which is what it should have looked like all along.',
      'PWR sits under the horizon beside the levelling controls, and it works both ways: switching off really does stop the sensors, and every instrument goes back to showing why it has nothing.',
      'What the app is, how to install it, and everything else moved into the i menu, where you can read it when you want to rather than being handed it in front of a button.',
    ],
    broken: [
      'Switching the panel off does not stop the weather or aircraft feeds. Those need no permission and no sensor, and stopping them would only cost a volunteer network another round of requests when you switch back on.',
      'The power switch is on the main screen only. From another page you would go back to PFD to reach it.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-08-03',
    headline: 'The panel stops denying a levelling it is actually using.',
    changed: [
      'Fixed: after a reload the panel said "Not levelled" while it was applying your stored levelling to every reading — the horizon badge and the diagnostics were right and the line under the horizon was wrong. It now says what is really being applied, and updates if you rotate the device.',
      'Following an aircraft now shows what its CREW has dialled in, where they broadcast it: the altitude and heading selected on the autopilot, and the altimeter setting they are flying to. It is the closest this panel gets to sitting behind them.',
    ],
    broken: [
      'Most aircraft do not broadcast the autopilot selections at all. Those read as crossed out with the aircraft named, because the panel will not guess at what a crew has set.',
      'The first-run pop-up still buries what the app is behind a big "Switch the panel on" button, so almost nobody reads it. Being fixed next.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-08-03',
    headline: 'Pick an airframe and see what is actually up there.',
    changed: [
      'The "Heard right now" list has a row of airframe buttons — whatever is overhead at that moment, named properly: "Boeing 747-400 (1)", "Airbus A320 (2)". Press one and the list shows only those.',
      'The buttons are built from the sky in front of you, so a type that has flown out of range stops being offered instead of becoming a button that finds nothing. If the one you picked leaves, the panel says so and goes back to showing everything.',
      'Aircraft that do not broadcast a type get their own button rather than being hidden, so the numbers always add up to what the scope is drawing.',
    ],
    broken: [
      'The plan view still draws every aircraft while the list is filtered. That is deliberate — a scope that hides traffic is a scope that lies about the sky.',
      'A type is only as good as what the aircraft transmits. Some send nothing, and the panel will not guess.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-08-03',
    headline: 'Far fewer requests to the aircraft feed, so it stops shutting you out.',
    changed: [
      'The app finally says what it is FOR: follow a real flight, take it on a flight and see roughly what the pilots see, or clamp it in the car while you drive. It only ever described a desk before.',
      'The radar asks for aircraft about a third as often. The cache in front of the aircraft feed was set shorter than the panel\'s own refresh, so it expired moments before every single request and never once saved one — the panel was asking a volunteer network eighteen times a minute.',
      'The version number moved to the bottom of the screen, giving the menu row back the space it was fighting for. Pressing it still opens the full diagnostics report.',
      'Changing range no longer costs a request at all. One fetch covers the widest scope and the smaller ranges filter what is already on the device, so the buttons are instant.',
    ],
    broken: [
      'Being rate limited is still possible and is not entirely ours to fix: the panel reaches the feed through Cloudflare, which shares one address across an enormous number of sites, so other people\'s traffic can use up the allowance.',
      'adsb.fi refuses this app outright — their protection blocks anything arriving from Cloudflare. The panel falls back to it and gets a block page, which is why you sometimes see two failures at once.',
      'You still cannot pick an aircraft type and see only those overhead. That is next.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-03',
    headline: 'An i menu at the top, holding everything that is not an instrument.',
    changed: [
      'An "i" button in the header. What this app is, how to put it on your home screen, what changed in each release, where every number comes from, and the diagnostics report — all behind one control instead of scattered across five places.',
      'What\'s new: every release, what it did, and what it still gets wrong.',
      'After an update the panel says so once, on the main screen, instead of changing under you silently.',
      'The first-time instructions now live in that menu rather than being parked on the SETUP page under the levelling controls.',
    ],
    broken: [
      'Following an aircraft still cannot show pitch, airspeed or slip. ADS-B does not broadcast them, and the panel will not invent them.',
    ],
  },
  {
    version: '1.7.4',
    date: '2026-08-03',
    headline: 'The share card is the icon art.',
    changed: [
      'The picture that appears when the app is shared is the instrument icon.',
    ],
    broken: [],
  },
  {
    version: '1.7.0',
    date: '2026-08-03',
    headline: 'Reset the panel without closing it, and tap a flight on the map.',
    changed: [
      'A power off / on control, so a panel that has got itself stuck can be restarted without hunting for the browser tab.',
      'Tapping an aircraft on the radar now starts following it — no more typing a callsign.',
      'The horizon reads all the way to 90 degrees instead of stopping at 30.',
      'Range buttons sit beside the radar on the main screen.',
    ],
    broken: [
      'The radar can take a few seconds to repopulate after a range change on a slow connection.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-03',
    headline: 'Leaning the phone no longer launches you into space.',
    changed: [
      'Tipping the device backwards and forwards used to swing the horizon wildly and cross it out. It now recognises that the phone was moved rather than the aeroplane, and rides through it on the gyro.',
      'The horizon sits still when the desk is still.',
    ],
    broken: [
      'A long, slow, deliberate tilt is still read as real — which is correct, because it is indistinguishable from a real one.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-03',
    headline: 'A first run that explains itself, and a radar you can aim.',
    changed: [
      'First-time instructions: what this is, how to install it on a phone or tablet, and what it will and will not do.',
      'The radar keeps the aircraft it already found when you change range.',
      'The menu takes less room at the top.',
    ],
    broken: [
      'You cannot yet centre the radar on an airport of your choosing.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-03',
    headline: 'Real aircraft overhead, and a horizon that works.',
    changed: [
      'The radar shows real aircraft near you, from live ADS-B, crediting whichever service answered.',
      'Following a flight drives the panel from that aircraft.',
      'Levelling: clamp the device at any angle, press once, and the horizon learns it.',
      'Pressing the version stamp produces a full text report of the panel state, to send instead of a photograph.',
    ],
    broken: [
      'Groundspeed and vertical speed need the device to actually move; on a desk they correctly read zero or cross out.',
    ],
  },
];

/** The newest release. What the on-screen "what's new" shows by default. */
export const CURRENT_RELEASE = RELEASES[0];

/**
 * Everything newer than a version the reader has already seen, newest first.
 *
 * An UNKNOWN version returns just the current release, never the whole history:
 * a first run, a cleared storage, or a downgrade should not open a wall of text
 * on someone who has never seen the app. An unrecognised string is exactly the
 * case where we know least, so it gets the smallest honest answer.
 */
export function releasesSince(seenVersion) {
  if (!seenVersion) return [];
  const index = RELEASES.findIndex((r) => r.version === seenVersion);
  if (index === -1) return [CURRENT_RELEASE];
  return RELEASES.slice(0, index);
}

/**
 * Should the post-update banner appear, and saying what?
 *
 * A FIRST EVER RUN GETS NO BANNER, and that is the case worth stating. Someone
 * who has never opened the panel is not being told "what changed" — there is no
 * before. They get the first-run instructions instead, and a banner on top of
 * those is two explanations competing on one screen. So a null seen-version
 * returns null here, and the caller still records the current version, which is
 * what makes their NEXT update announce itself properly.
 *
 * Returns null or `{ version, headline, count }` where count is how many
 * releases were missed — a reader who skipped four wants to know that.
 */
export function updateNotice(seenVersion, currentVersion = CURRENT_RELEASE.version) {
  if (!seenVersion) return null;
  if (seenVersion === currentVersion) return null;
  const missed = releasesSince(seenVersion);
  if (!missed.length) return null;
  return {
    version: currentVersion,
    headline: missed[0].headline,
    count: missed.length,
  };
}
