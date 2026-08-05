export type TrinityLocation = {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  state: "TX";
  postalCode: string;
  phone: string;
};

// Addresses and phone numbers were verified against Trinity Dental Centers' public
// locations page on 2026-07-30. The Eastex office name reflects the internal name.
export const TRINITY_LOCATIONS: readonly TrinityLocation[] = [
  { id: "location-aldine", slug: "eastex", name: "Trinity Dental – Eastex", address: "11939 Eastex Fwy", city: "Houston", state: "TX", postalCode: "77039", phone: "(281) 816-4825" },
  { id: "location-channelview", slug: "channelview", name: "Trinity Dental – Channelview", address: "5815 East Sam Houston Pkwy N", city: "Houston", state: "TX", postalCode: "77049", phone: "(281) 303-5096" },
  { id: "location-cleveland", slug: "cleveland", name: "Trinity Dental – Cleveland", address: "106 Truly Plaza", city: "Cleveland", state: "TX", postalCode: "77327", phone: "(281) 746-6564" },
  { id: "location-conroe", slug: "conroe", name: "Trinity Dental – Conroe", address: "1304 W Davis Suite A", city: "Conroe", state: "TX", postalCode: "77304", phone: "(936) 209-1548" },
  { id: "location-crosby", slug: "crosby", name: "Trinity Dental – Crosby", address: "14045 FM 2100 #250", city: "Crosby", state: "TX", postalCode: "77532", phone: "(281) 942-4167" },
  { id: "location-denver-harbor", slug: "denver-harbor", name: "Trinity Dental – Denver Harbor", address: "7008 Lyons Ave", city: "Houston", state: "TX", postalCode: "77020", phone: "(713) 766-0943" },
  { id: "location-humble", slug: "humble", name: "Trinity Dental – Humble", address: "9455 North Sam Houston Pkwy E #600", city: "Humble", state: "TX", postalCode: "77396", phone: "(281) 335-3630" },
  { id: "location-katy", slug: "katy", name: "Trinity Dental – Katy", address: "24020 Clay Rd. Suite 106", city: "Katy", state: "TX", postalCode: "77493", phone: "(832) 400-4129" },
  { id: "location-livingston", slug: "livingston", name: "Trinity Dental – Livingston", address: "1601 US Highway 59 N Loop Suite 400", city: "Livingston", state: "TX", postalCode: "77351", phone: "(936) 463-0405" },
  { id: "location-magnolia", slug: "magnolia", name: "Trinity Dental – Magnolia", address: "18640 Farm to Market Rd 1488 Ste D", city: "Magnolia", state: "TX", postalCode: "77354", phone: "(832) 379-5488" },
  { id: "location-normandy", slug: "normandy", name: "Trinity Dental – Normandy (Maxey Rd)", address: "503 Maxey Rd", city: "Houston", state: "TX", postalCode: "77013", phone: "(832) 358-3710" },
  { id: "location-porter", slug: "porter", name: "Trinity Dental – Porter", address: "23762 US-59", city: "Porter", state: "TX", postalCode: "77365", phone: "(281) 306-5194" },
  { id: "location-rosenberg", slug: "rosenberg", name: "Trinity Dental – Rosenberg", address: "1636 Minonite Road Suite 500", city: "Rosenberg", state: "TX", postalCode: "77469", phone: "(832) 847-7252" },
  { id: "location-sawyer-heights", slug: "sawyer-heights", name: "Trinity Dental – Sawyer Heights", address: "1919 Taylor St #3A", city: "Houston", state: "TX", postalCode: "77007", phone: "(713) 766-4389" },
  { id: "location-tomball", slug: "tomball", name: "Trinity Dental – Tomball", address: "14215 Farm to Market 2920 #103", city: "Tomball", state: "TX", postalCode: "77377", phone: "(832) 956-1308" },
  { id: "location-waller", slug: "waller", name: "Waller Dental", address: "31315 F.M. 2920 Rd., Ste. 16A", city: "Waller", state: "TX", postalCode: "77484", phone: "(936) 372-2673" },
  { id: "location-sealy", slug: "sealy", name: "Trinity Dental – Sealy", address: "2303 TX-36 Suite C", city: "Sealy", state: "TX", postalCode: "77474", phone: "(979) 315-4084" },
] as const;

export const PEARL_DENTISTRY_LOCATION: TrinityLocation = {
  id: "location-pearl-dentistry",
  slug: "pearl-dentistry",
  name: "Pearl Dentistry",
  address: "Pilot office address TBD",
  city: "TBD",
  state: "TX",
  postalCode: "00000",
  phone: "TBD",
};

export const PILOT_LOCATIONS: readonly TrinityLocation[] = [
  ...TRINITY_LOCATIONS,
  PEARL_DENTISTRY_LOCATION,
] as const;

export const CENTRAL_MANAGER_ACCOUNTS = [
  { id: "manager-ruben-lopez", name: "Ruben Lopez", email: "rlopez@trinitydentalcenters.com" },
  { id: "manager-zain", name: "Zain", email: "zain@trinitydentalcenters.com" },
  { id: "manager-leo", name: "Leo", email: "leo@odysseysolutions.co" },
] as const;

export function officeAccountEmail(location: Pick<TrinityLocation, "slug">): string {
  if (location.slug === "pearl-dentistry") {
    return "humble@pearlmoderndentistry.com";
  }

  return `${location.slug.replaceAll("-", "")}@trinitydentalcenters.com`;
}
