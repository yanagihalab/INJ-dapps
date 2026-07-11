# Production Checklist

Use this after each VPS deployment.

## Infrastructure

- [ ] `systemctl status inj-reviews-backend`
- [ ] `systemctl status inj-reviews-frontend`
- [ ] `curl -f https://ik1-206-76937.vs.sakura.ne.jp/reviews/api/health`
- [ ] `curl -I https://ik1-206-76937.vs.sakura.ne.jp/reviews/admin`
- [ ] Confirm `/etc/nginx/sites-enabled` does not include the old `inj-reviews` example site.

## Admin

- [ ] Open `/reviews/admin`.
- [ ] Enter the admin API token for this browser session.
- [ ] Connect Keplr with the admin wallet.
- [ ] Confirm the admin gate shows admin matched.

## Store Registration

- [ ] Issue a store registration code from the admin page.
- [ ] Confirm server metadata save succeeds.
- [ ] Open `/reviews/stores/register`.
- [ ] Enter the code and confirm `store_ref` and store name are auto-filled.
- [ ] Register the profile with Keplr.

## Visit QR

- [ ] Register one or more QR codes in the admin QR tab.
- [ ] Open `/reviews/stores/:storeId/qr`.
- [ ] Enter one registered QR code and confirm the displayed QR payload includes `node_id`, `store_id`, and `code`.
- [ ] Scan the QR on a smartphone.
- [ ] Confirm the visit store appears before sending.
- [ ] Submit the visit transaction with Keplr.

## Reviews

- [ ] Confirm the visit appears in review creation candidates.
- [ ] Submit a review.
- [ ] Confirm the review appears in `/reviews/reviews/list`.
- [ ] From admin review management, select the review and test edit/hide.

## Visits

- [ ] From admin visit management, select the store.
- [ ] Confirm visits load by store.
- [ ] Test visitor filtering.
- [ ] Revoke a test visit when safe to do so.
