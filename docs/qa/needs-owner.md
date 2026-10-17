# Needs the owner's decision

Items the unattended run did not decide or could not do safely. Each says what was found and what is suggested.

1. **Confirm `META_APP_SECRET` is set on Vercel (Production and Preview).** Without it, webhooks are not verified; after
   this run, payments from unverified webhooks are no longer auto-marked paid (they wait for staff to check). If the
   secret is missing on the live site, automatic "Paid" would stop until it is added. Where: Vercel → Project →
   Settings → Environment Variables (the Meta app's App Secret, from developers.facebook.com → App settings → Basic).
2. **Should staff (not only managers) be allowed to refund or undo payments?** Today any login that can work on
   orders can record a refund or undo a staff-recorded payment. Undo removes the payment record, so a staff member
   could hide cash taken. Suggested: managers only for Undo payment and Record refund. Not changed, as it changes how
   shops work.
3. **Click through the Vercel preview once.** The preview of Madhu_changes
   (https://thabaal-git-madhuchanges-thabaal26-4140.vercel.app) is behind Vercel sign-in, so it couldn't be opened
   from here; Vercel reports the build as Ready. Open it while signed in to Vercel and look at Home, Orders and a
   customer page (the pages that crashed before this run). Don't record test payments there: the preview may use the
   live database.
4. **Merge pull request #1 when happy** (https://github.com/thabaal26/thabaal/pull/1). It was opened earlier for this
   branch; the QA report is posted on it as a comment. Nothing was merged. CodeRabbit isn't installed on the
   repository, so there were no CodeRabbit comments to answer.
5. **Demo catalogue:** a business that hasn't connected WhatsApp sees made-up products (Basmati rice, Toor dal…) on
   Products. That's intended demo mode; decide whether real clients should see an empty "connect WhatsApp" page instead.
