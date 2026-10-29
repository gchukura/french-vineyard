import { describe, expect, it } from "vitest";

import {
  AffiliateError,
  affiliateEnv,
  bookingHotelPage,
  bookingUrl,
  buildOutboundUrl,
  campaignCode,
  checkTarget,
  expediaHotelPage,
  expediaUrl,
  gygUrl,
  isAffiliateProvider,
  pageSlugFromPath,
  viatorUrl,
  winalistUrl,
} from "@/lib/affiliates";

const env = {
  GYG_PARTNER_ID: "GYG123",
  VIATOR_PID: "P00012345",
  BOOKING_AID: "1234567",
  TRAVELPAYOUTS_MARKER: "717641",
  TRAVELPAYOUTS_TRS: "516686",
  TRAVELPAYOUTS_BOOKING_PROGRAM: "4114",
  EXPEDIA_CAMREF: "1101lABC",
  WINALIST_REF: "fv",
};
const ref = { page: "regions-champagne" };

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("gygUrl", () => {
  it("adds partner_id, cmp and utm, keeping the tour path", () => {
    const url = gygUrl("https://www.getyourguide.com/reims-l1158/cellar-tour-t1/", env, ref);
    expect(new URL(url).pathname).toBe("/reims-l1158/cellar-tour-t1/");
    expect(params(url)).toEqual({
      partner_id: "GYG123",
      cmp: "regions-champagne",
      utm_source: "frenchvineyard",
      utm_medium: "affiliate",
      utm_campaign: "regions-champagne",
    });
  });

  it("needs GYG_PARTNER_ID", () => {
    expect(() => gygUrl("https://www.getyourguide.com/", {}, ref)).toThrow(/GYG_PARTNER_ID/);
  });
});

describe("viatorUrl", () => {
  it("adds pid, the link mcid, medium and campaign", () => {
    const url = viatorUrl("https://www.viator.com/tours/Reims/Cellar-Tour/d1-123P1", env, ref);
    expect(params(url)).toMatchObject({
      pid: "P00012345",
      mcid: "42383",
      medium: "link",
      campaign: "regions-champagne",
      utm_source: "frenchvineyard",
    });
  });
});

describe("winalistUrl", () => {
  it("adds the ref parameter", () => {
    const url = winalistUrl("https://www.winalist.com/fr/estate/1", env, ref);
    expect(params(url)).toMatchObject({ ref: "fv", utm_source: "frenchvineyard" });
  });
});

describe("bookingUrl", () => {
  const hotel = "https://www.booking.com/hotel/fr/royal-champagne.html";

  it("uses aid and label when BOOKING_AID is set", () => {
    const url = bookingUrl(hotel, env, ref);
    expect(new URL(url).hostname).toBe("www.booking.com");
    expect(params(url)).toMatchObject({
      aid: "1234567",
      label: "regions-champagne",
      utm_source: "frenchvineyard",
    });
  });

  it("wraps in a Travelpayouts link when only the marker is set", () => {
    const { BOOKING_AID: _aid, ...tp } = env;
    void _aid;
    const url = bookingUrl(hotel, tp, ref);
    const p = params(url);
    expect(url.startsWith("https://tp.media/r?")).toBe(true);
    expect(p).toMatchObject({
      marker: "717641",
      trs: "516686",
      p: "4114",
      sub_id: "regions-champagne",
    });
    expect(new URL(p.u!).pathname).toBe("/hotel/fr/royal-champagne.html");
    expect(new URL(p.u!).searchParams.get("utm_source")).toBe("frenchvineyard");
  });

  it("fails clearly with neither configured", () => {
    expect(() => bookingUrl(hotel, {}, ref)).toThrow(/TRAVELPAYOUTS_MARKER/);
  });
});

describe("expediaUrl", () => {
  it("builds a Partnerize link: camref, pubref, then the encoded destination", () => {
    const url = expediaUrl("https://www.expedia.com/h123456.Hotel-Information", env, ref);
    const m =
      /^https:\/\/prf\.hn\/click\/camref:1101lABC\/pubref:regions-champagne\/destination:(.+)$/.exec(
        url,
      );
    expect(m).not.toBeNull();
    const dest = new URL(decodeURIComponent(m![1]!));
    expect(dest.pathname).toBe("/h123456.Hotel-Information");
    expect(dest.searchParams.get("utm_campaign")).toBe("regions-champagne");
  });
});

describe("Stay22", () => {
  const stay22 = { ...env, STAY22_AID: "frenchvineyard" };

  it("wraps the Booking.com hotel page in an Allez link, ahead of BOOKING_AID", () => {
    const url = bookingUrl("https://www.booking.com/hotel/fr/royal-champagne.html", stay22, ref);
    expect(url.startsWith("https://www.stay22.com/allez/booking?")).toBe(true);
    const p = params(url);
    expect(p).toMatchObject({ aid: "frenchvineyard", campaign: "regions_champagne" });
    const hotel = new URL(p.link!);
    expect(hotel.pathname).toBe("/hotel/fr/royal-champagne.html");
    expect(hotel.searchParams.get("aid")).toBeNull();
    expect(hotel.searchParams.get("utm_campaign")).toBe("regions-champagne");
  });

  it("wraps the Expedia hotel page too, ahead of Partnerize", () => {
    const url = expediaUrl("https://www.expedia.com/h123456.Hotel-Information", stay22, ref);
    expect(url.startsWith("https://www.stay22.com/allez/expedia?")).toBe(true);
    expect(new URL(params(url).link!).pathname).toBe("/h123456.Hotel-Information");
  });

  it("still refuses a hotel page on another host", () => {
    expect(() => bookingUrl("https://evil.example/hotel", stay22, ref)).toThrow(AffiliateError);
  });

  it("is read from the environment", () => {
    expect(affiliateEnv({ STAY22_AID: "x" }).STAY22_AID).toBe("x");
  });
});

describe("checkTarget", () => {
  it("refuses other hosts and plain http", () => {
    expect(() => checkTarget("gyg", "https://evil.example/")).toThrow(AffiliateError);
    expect(() => checkTarget("booking", "https://booking.com.evil.example/")).toThrow(
      AffiliateError,
    );
    expect(() => checkTarget("viator", "http://www.viator.com/")).toThrow(AffiliateError);
    expect(() => checkTarget("expedia", "not a url")).toThrow(AffiliateError);
  });

  it("accepts the provider's own domains", () => {
    expect(checkTarget("gyg", "https://www.getyourguide.co.uk/x").hostname).toBe(
      "www.getyourguide.co.uk",
    );
    expect(checkTarget("expedia", "https://www.expedia.fr/x").hostname).toBe("www.expedia.fr");
  });
});

describe("buildOutboundUrl", () => {
  it("dispatches by provider", () => {
    expect(buildOutboundUrl("gyg", "https://www.getyourguide.com/", env, ref)).toContain(
      "partner_id=GYG123",
    );
    expect(buildOutboundUrl("viator", "https://www.viator.com/", env, ref)).toContain(
      "pid=P00012345",
    );
  });
});

describe("helpers", () => {
  it("makes campaign codes Viator accepts", () => {
    expect(campaignCode("Regions/Champagne – Épernay!")).toBe("regions-champagne-pernay");
    expect(campaignCode("///")).toBe("unknown");
  });

  it("turns referring paths into page slugs", () => {
    expect(pageSlugFromPath("/regions/champagne/")).toBe("regions-champagne");
    expect(pageSlugFromPath("/")).toBe("home");
    expect(pageSlugFromPath("/plan/getting-there/?x=1#y")).toBe("plan-getting-there");
    expect(pageSlugFromPath(null)).toBe("unknown");
  });

  it("builds hotel pages from Sheet ids", () => {
    expect(bookingHotelPage("fr/royal-champagne")).toBe(
      "https://www.booking.com/hotel/fr/royal-champagne.html",
    );
    expect(bookingHotelPage("https://www.booking.com/hotel/fr/x.html")).toBe(
      "https://www.booking.com/hotel/fr/x.html",
    );
    expect(expediaHotelPage("123456")).toBe("https://www.expedia.com/h123456.Hotel-Information");
  });

  it("recognises providers and reads env", () => {
    expect(isAffiliateProvider("gyg")).toBe(true);
    expect(isAffiliateProvider("amazon")).toBe(false);
    expect(affiliateEnv({ GYG_PARTNER_ID: "x", OTHER: "y" }).GYG_PARTNER_ID).toBe("x");
  });
});
