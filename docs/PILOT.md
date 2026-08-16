# Design-partner pilot script

Goal: **5 real visits** at one UK clinic without critical privacy issues.

## Before day 1

- [ ] Staging/production URL live; `/api/v1/health` = ok  
- [ ] Owner + reception logins (change demo password on laptop)  
- [ ] `AI_PROVIDER=mock`  
- [ ] Privacy notice reviewed; retention set (e.g. 14 days)  
- [ ] Partner signed a short pilot note (controller = clinic)  

## Visit checklist (repeat ×5)

For each patient:

1. Book (staff or `/book/<slug>`)  
2. Today → **Open visit**  
3. Capture **recording consent**  
4. Record a short real consult (or first 3–5 minutes)  
5. Stop → wait for organised draft  
6. Edit anything wrong → **Sign**  
7. Money → mark invoice paid (if applicable)  
8. Optional: rebook from Plan  

After visit, jot:

| # | Patient initials | Minutes to signed note | Used AI draft? | Issues |
|---|------------------|------------------------|----------------|--------|
| 1 | | | Y/N | |
| 2 | | | Y/N | |
| 3 | | | Y/N | |
| 4 | | | Y/N | |
| 5 | | | Y/N | |

## Also once during the week

- [ ] Cancel one appointment with someone on waitlist → confirm offer  
- [ ] Settings → export note audits  
- [ ] Ask practitioner: “Would you miss Treow vs Cliniko for documentation?”  

## Pass / fail

**Pass:** 5 signed notes, zero recording-without-consent, zero privacy incidents, partner wants to continue.  
**Fail / pause:** any consent skip, data leak worry, or notes unusable → fix before more patients.

## After pass

1. Sign AI vendor DPA  
2. Set `AI_PROVIDER=openai` (or EU vendor) on staging first  
3. Re-test 2 visits before production AI  
