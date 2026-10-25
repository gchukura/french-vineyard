# Putting frenchvineyard.com live

Until the domain points at Vercel, the site runs at **https://french-vineyard.vercel.app**:

- `NEXT_PUBLIC_SITE_URL` stays `https://frenchvineyard.com`, so canonical links, JSON-LD and sitemaps already use the real domain.
- The content pipeline revalidates through the `SITE_URL` repository variable, set to `https://french-vineyard.vercel.app` for now.
- `SITE_NOINDEX` is on. `robots.txt` disallows everything and every response carries `X-Robots-Tag: noindex, nofollow`. The switch is on unless set to `0`, `false`, `off` or `no`, so a deployment without the variable stays hidden too.

Do parts 1–3 as soon as you have DNS access. Do part 4 on launch day.

## 1. Add the domains to the Vercel project

1. Vercel dashboard → the **french-vineyard** project → **Settings → Domains**.
2. Add `frenchvineyard.com`. When Vercel offers to add `www.frenchvineyard.com` too, accept it.
3. Make **`frenchvineyard.com` the primary domain** and set `www.frenchvineyard.com` to **redirect (308) to `frenchvineyard.com`**. The apex has to be primary because `NEXT_PUBLIC_SITE_URL` and every canonical use it.
4. Leave this page open: it shows the exact DNS records Vercel wants, and later it confirms them.

## 2. Set the DNS records at the registrar

In the registrar's DNS settings for `frenchvineyard.com`:

1. **Remove** the records that point the domain somewhere else today: any `A`, `AAAA` or `CNAME` on `@` (the apex) and on `www`. Today the domain answers from an openresty server (likely a parking page), and those records have to go. **Keep** `MX` and email-related `TXT` records (SPF, DKIM, DMARC) if you use email on the domain.
2. **Add** the records Vercel shows on the Domains page. At the time of writing they are:

   | Type    | Name  | Value                   | TTL |
   | ------- | ----- | ----------------------- | --- |
   | `A`     | `@`   | `76.76.21.21`           | 300 |
   | `CNAME` | `www` | `cname.vercel-dns.com.` | 300 |

   If Vercel shows a project-specific value (a different `A` address, or a CNAME like `…vercel-dns-0xx.com`), use Vercel's value, not this table.

3. If the domain has **CAA** records, add `0 issue "letsencrypt.org"`; otherwise Vercel can't issue the certificate. With no CAA records at all, do nothing.
4. Don't switch the nameservers to Vercel unless you also want to move email records there; the two records above are enough.

## 3. Check the domain, then point the pipeline at it

1. Wait until Vercel shows **Valid Configuration** for both domains and has issued the certificate. This takes minutes to a few hours, depending on the old records' TTL.
2. Check from a terminal:

   ```sh
   curl -sI https://frenchvineyard.com/ | grep -i '^server'        # server: Vercel
   curl -sI https://www.frenchvineyard.com/ | grep -i '^location'  # https://frenchvineyard.com/
   curl -s -X POST -H 'content-type: application/json' -d '{"tags":["x"]}' \
     https://frenchvineyard.com/api/revalidate/                    # {"error":"Unauthorized"}
   ```

   The last one must return the route's own `Unauthorized` (401), not a 405 or a parking page.

3. Switch the pipeline to the real domain:

   ```sh
   gh variable set SITE_URL --repo gchukura/french-vineyard --body https://frenchvineyard.com
   ```

   If you run the pipeline locally, update `SITE_URL` in `.env.local` too, or remove it, since it defaults to `NEXT_PUBLIC_SITE_URL`.

4. In Vercel → **Settings → Environment Variables**, confirm `NEXT_PUBLIC_SITE_URL` is `https://frenchvineyard.com` for Production. The code defaults to that value, so an unset variable is fine as well.

The site stays out of search results until part 4.

## 4. Launch day: let search engines in

1. Vercel → **Settings → Environment Variables** → add or edit `SITE_NOINDEX` = `0` for the **Production** environment only. Leave Preview without it, so preview deployments stay hidden.
2. **Redeploy production.** Environment variables take effect only on a new deployment: Deployments → the latest Production deployment → **Redeploy**. `robots.txt` and the `X-Robots-Tag` header are both set at build time.
3. Check:

   ```sh
   curl -s https://frenchvineyard.com/robots.txt                 # Allow rules and the sitemap line, no "Disallow: /"
   curl -sI https://frenchvineyard.com/ | grep -i x-robots-tag   # no output
   ```

4. In Google Search Console, add a **Domain** property for `frenchvineyard.com` (verified with a DNS `TXT` record at the registrar) and submit `https://frenchvineyard.com/sitemap.xml`. In Bing Webmaster Tools, import the property from Search Console.
5. Plausible already uses `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=frenchvineyard.com`; confirm the site exists in Plausible under that name.

After launch, `french-vineyard.vercel.app` keeps serving the same deployment. Every page's canonical points at `https://frenchvineyard.com`, so search engines index the real domain.
