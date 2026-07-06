# Auracle — PM Perspective Report

> Status: **draft** (2026-07-07) — for citation in a product proposal report.
>
> This document is derived from existing code and design docs (README, `auracle_evaluation_design.md`, `auracle_personalization_plan.md`, `auracle_ui_design.md`), **not the output of real user research**. Sections marked "to be validated" must be flagged as assumptions, not findings, in the final report.

---

## 1. Product Summary

Auracle is an AI radio-DJ product combining real-time voice companionship, automatic energy-arc curation, and Spotify-taste personalization. It is currently a single-user, desktop-Chrome demo built to test the hypothesis that personalization improves the radio experience (A/B/C conditions). It has no acquisition, retention, or monetization instrumentation yet.

---

## 2. User Personas

The personas below are candidates inferred from existing product features — **not the output of market research or user interviews**. They should be labeled as unvalidated hypotheses in the formal report, with a recommendation to run 5–8 screening interviews with target users before proceeding.

| Persona | Core need | Supporting product signal |
|---|---|---|
| **Focused Companion** (student / remote worker) | Wants background music with human presence, without breaking focus | Energy arc (warm-up→peak→wind-down); `nudge` preferred over full replan; captions stay non-intrusive |
| **Music Discovery Seeker** (heavy Spotify user) | Wants curation that "knows my taste," not a cold-start algorithm | Condition C: Spotify taste + Premium mixed queue; Personalization Likert metric |
| **Nostalgic Radio Listener** (casual / emotional companionship) | Wants the ritual feel of a live human radio host | StageHeader ON AIR pill; Live voice chit-chat; Talk Window (ADR-0004) |

**Risk note**: All three personas are reverse-engineered from "what we built" rather than validated against real user data.

---

## 3. Business Metrics

Today there are research metrics but no business metrics — `auracle_evaluation_design.md` explicitly excludes cross-session skip-rate as a product metric to avoid contaminating the experiment, which is correct for research validity, but it means there is currently zero commercialization instrumentation. The table below splits "existing" from "to be added."

### 3.1 Existing Signals (research-only, not final business metrics)

| Metric | Description |
|---|---|
| Subjective Likert | Relevance / Coherence / DJ Experience / Personalization |
| Energy Smoothness, Arc Adherence | Curation quality of the energy arc |
| Genre Diversity, Spotify Mix Rate | Track diversity and Spotify-mix share |
| Replan Delta | Delta between pre- and post-replan queues |
| `session_events` (session_created / track_started / feedback / skip_latency) | Raw event stream; a future funnel-metric data source, but currently only serves A/B/C comparison |

### 3.2 To Be Added (productization phase)

- **North Star candidate**: Weekly Minutes with DJ per user — analogous to Spotify's listening-time metric, and a proxy for whether the "radio feel" holds up.
- **Acquisition**: Landing-page → Spotify-connect conversion rate (since Condition C depends on Spotify taste, this step is a leading indicator of whether the personalization value proposition holds).
- **Activation**: First-session completion rate (played ≥1 track vs. bounced), rate of first voice interaction.
- **Engagement**: Session duration, tracks per session, skip rate, like/dislike trigger rate.
- **Retention**: D1/D7 return rate, weekly active sessions — there is currently no cross-session identity/retention design at all.
- **Cost**: Per-session Gemini Live API cost (real-time voice streaming is not cheap); no usage/cost monitoring exists in the codebase today.

---

## 4. Architecture–Metric Tension (Risk)

`auracle_personalization_plan.md` explicitly states that "Auracle does not maintain a second long-term taste profile" — cross-session personalization is fully outsourced to Spotify, and Auracle only handles live, in-session adaptation. If retention is set as a core business metric, this architectural choice may limit the retention levers Auracle itself can claim credit for (retention would be attributable more to the Spotify ecosystem than to any user understanding Auracle accumulates). This tension should be stated explicitly as a risk/open question in the report, not glossed over.

---

## 5. Recommendations for the Report

1. Personas section: present the 3 candidate personas above, explicitly labeled "inferred from product assumptions, to be validated via interviews before launch" — not packaged as user-research findings.
2. Business metrics section: present as two tables — "Validation phase (existing A/B/C research metrics)" and "Productization phase (funnel/retention/cost metrics to be added)."
3. State the architecture–metric tension from Section 4 as an explicit risk item, with a preliminary mitigation direction (e.g., explore whether Auracle's own in-session preference signals could also compound into an attributable retention lever).

---

## 6. Conversion-Rate Measurement at Demo Stage

There is currently no real external traffic to measure a market conversion rate against — there is no public landing page, and the 18 study participants were recruited, not acquired. Two distinct paths exist, and they should not be conflated:

1. **Proxy activation-rate within study participants** (near-zero cost, available now): among Condition C participants, compute the share who successfully connected Spotify vs. attempted to connect. This is a technical activation rate, not a market conversion rate, but it can be computed directly from the existing `spotify_taste_summary_present` field in `session_events` — no new instrumentation needed. Report it honestly as a friction signal for the personalization precondition, not as product-market conversion.
2. **Real market conversion rate** (requires new infrastructure): needs a public landing page with genuine unfamiliar traffic, plus analytics (e.g., PostHog/GA) instrumenting "visit → click Connect Spotify → complete OAuth." This does not exist today and would be a separate fake-door / smoke test, independent of the current A/B/C experiment code.

If the report's purpose is simply to present this honestly as future work, path 1 can produce a real number now, and path 2 should be stated as "to be validated, requires an acquisition entry point first."
