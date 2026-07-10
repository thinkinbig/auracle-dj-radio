# Auracle — PM Perspective Report

---

## 1. Product Summary

Auracle is an AI radio-DJ product combining real-time voice companionship, automatic energy-arc curation, and Spotify-taste personalization. It is currently a single-user, desktop-Chrome demo built to test the hypothesis that personalization improves the radio experience (A/B/C conditions). It has no acquisition, retention, or monetization instrumentation yet.

---

## 2. User Personas

Our N=5 testing validates the "Focused Companion" and "Music Discovery Seeker" personas. 100% of participants are students (40% working simultaneously), and 80% listen to music daily. Furthermore, 100% have used AI voice assistants before (40% frequently). This confirms our target audience is highly digitally native and requires seamless, non-intrusive companionship.

| Persona | Core need | Supporting product signal |
|---|---|---|
| **Focused Companion** (student / remote worker) | Wants background music with human presence, without breaking focus | Energy arc (warm-up→peak→wind-down); `nudge` preferred over full replan; captions stay non-intrusive |
| **Music Discovery Seeker** (heavy Spotify user) | Wants curation that "knows my taste," not a cold-start algorithm | Condition C: Spotify taste + Premium mixed queue; Personalization Likert metric |
| **Nostalgic Radio Listener** (casual / emotional companionship) | Wants the ritual feel of a live human radio host | StageHeader ON AIR pill; Live voice chit-chat; Talk Window (ADR-0004) |

---

## 3. Business Metrics

Today there are research metrics but no business metrics — `auracle_evaluation_design.md` explicitly excludes cross-session skip-rate as a product metric to avoid contaminating the experiment, which is correct for research validity, but it means there is currently zero commercialization instrumentation. The table below splits "existing" from "to be added."

### 3.1 Existing Signals

| Metric | Description |
|---|---|
| Coherence (Energy/Mood Match) | 4.6 / 5 |
| Voice Conversation Smoothness & UI | 4.6 / 5 |
| DJ Experience (Personality) | 4.4 / 5 |
| Relevance (Commentary match) | 4.0 / 5 |

### 3.2 To Be Added (productization phase)

- **North Star candidate**: Weekly Minutes with DJ per user — analogous to Spotify's listening-time metric, and a proxy for whether the "radio feel" holds up.
- **Acquisition**: Landing-page → Spotify-connect conversion rate (since Condition C depends on Spotify taste, this step is a leading indicator of whether the personalization value proposition holds).
- **Activation**: First-session completion rate (played ≥1 track vs. bounced), rate of first voice interaction.
- **Engagement**: Session duration, tracks per session, skip rate, like/dislike trigger rate.
- **Retention**: D1/D7 return rate, weekly active sessions — there is currently no cross-session identity/retention design at all.
- **Cost**: Per-session Gemini Live API cost (real-time voice streaming is not cheap); no usage/cost monitoring exists in the codebase today.

---

## 4. Architecture–Metric Tension (Risk)

Currently, Auracle does not maintain its own long-term user taste profile. Cross-session personalization is fully outsourced to the Spotify ecosystem, meaning Auracle only handles live, in-session adaptation. While this architectural choice significantly simplifies the MVP development, it introduces a critical business risk: if user retention is set as a core north-star metric, Auracle currently lacks proprietary retention levers. Any long-term retention would be attributable more to Spotify's underlying algorithm than to Auracle's own accumulated user understanding. This strategic dependency poses a defensibility risk that must be addressed before scaling commercialization.

---

## 5. Recommendations for the Report (Based on UAT Feedback)

Based on our N=5 UAT sessions, we recommend the following priorities for the MVP Roadmap:

1. **Privacy & Control (High Priority)**: 40% of users reported the DJ "kept listening" to background conversations. A "Push-to-Talk" or "Mic-Mute" toggle is essential.

2. **Post-Session Value**: Users requested an "Export to Spotify Playlist" feature to save liked songs.

3. **Voice Customization**: Users expressed a desire for multiple voice options (e.g., female voice, calmer tone).

---

## 6. MVP Validation Status

Our initial product validation was conducted through a User Acceptance Testing (UAT) session with an independent cohort of 5 TUM students. To ensure objective and unbiased usability feedback, all participants were external to the development team. 

This phase of testing focused strictly on evaluating the core voice interaction and UI experience. Our validation status is summarized as follows:

1. **Core Value & UX Validated**: The testing confirmed that our interactive AI DJ format and intuitive interface effectively deliver the intended radio experience. Participants successfully navigated the system and engaged with the AI without major friction.
2. **Technical Feasibility Validated**: The system demonstrated strong performance in voice conversation smoothness and latency (rated 4.6/5), proving the viability of our real-time interaction architecture.
3. **Future Market Validation**: With the core MVP voice experience validated, our next milestone is to test the broader personalization features and measure organic activation rates. Future testing will require a public landing page and the implementation of session-based analytics to track long-term user retention.
