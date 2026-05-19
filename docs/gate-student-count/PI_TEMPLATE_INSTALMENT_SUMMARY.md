# PI template - Phase 5 instalment summary table

**Operator step (post-deploy).** The code path now renders a
`INSTALMENT_SUMMARY` array + four summary placeholders in the
docxtemplater bag. The .docx template at
`public/ops-templates/pi-template.docx` needs a one-time manual edit
in Microsoft Word (or any docx editor) to consume them; without that
edit the placeholders simply do not render and the existing
single-instalment PI behaviour is unchanged.

## What lives in the bag now (Phase 5)

```js
INSTALMENT_SUMMARY: [
  {
    seq: '1',
    label: '1 of 4',
    dueDate: '01-Jun-2026',
    status: 'Paid (20-May-2026)',  // or 'This invoice' or 'Due'
    amount: 'Rs 1,12,500',
    breakdown: '',                 // 'Nominal Rs 1,00,000 less excess credit Rs 12,500' when applicable
    isCurrent: false,              // true for the row this PI represents
    isPaid: true,
  },
  // ...one entry per instalment on the parent MOU
],
CONTRACT_TOTAL_AT_CURRENT_COUNT: 'Rs 4,00,000',
TOTAL_RECEIVED_TO_DATE: 'Rs 1,12,500',
CURRENT_STUDENT_COUNT: '400',
```

## What to paste into the .docx

Open `public/ops-templates/pi-template.docx` in Word and add a new
section below the existing line-items table. Use docxtemplater's
loop syntax `{#...}` / `{/...}` and the table tag `{:t...}` for
proper row repetition:

```
Instalment Summary

| #         | Due date     | Status        | Amount        |
| {#INSTALMENT_SUMMARY} |  |  |  |
| {seq}     | {dueDate}    | {status}      | {amount}      |
| {breakdown}|             |               |               |
| {/INSTALMENT_SUMMARY} |  |  |  |

Contract total at {CURRENT_STUDENT_COUNT} students: {CONTRACT_TOTAL_AT_CURRENT_COUNT}
Total received to date: {TOTAL_RECEIVED_TO_DATE}
```

The exact placement / styling is operator-controlled; the placeholder
names above are the contract.

## Why this is an operator step

The .docx binary cannot be reliably round-tripped through a code
edit (XML structure inside the zip is tooling-specific). The code
side delivers the data; the .docx side consumes it. Once the
template is updated and re-uploaded (`git add public/ops-templates/
pi-template.docx`), every generated PI from that point forward
includes the summary table.

## Smoke verifying the placeholder bag

```
$ npx vitest run src/lib/pi/generatePi.test.ts
```

The 21 existing tests continue to pass. They do not (yet) assert on
the new keys, but they do exercise the buildPlaceholderBag path so
any shape regression would surface during render.

## Rollback

If the template edit causes any rendering anomaly, revert the
template binary; the code-side new keys are additive and the
template will simply ignore unknown placeholders without erroring.
