import type { GooglePlace } from './fetch-google-places';

export const describePlace = (place: GooglePlace) => ({
  id: place.id ?? null,
  resourceName: place.name ?? null,
  displayName: place.displayName?.text ?? null,
  formattedAddress:
    place.formattedAddress ?? place.shortFormattedAddress ?? null,
  coordinates: place.location
    ? {
        latitude: place.location.latitude ?? null,
        longitude: place.location.longitude ?? null,
      }
    : null,
  primaryType: place.primaryType ?? null,
  primaryTypeDisplayName: place.primaryTypeDisplayName?.text ?? null,
  types: place.types ?? [],
  businessStatus: place.businessStatus ?? null,
  rating: place.rating ?? null,
  userRatingCount: place.userRatingCount ?? null,
  priceLevel: place.priceLevel ?? null,
  websites: {
    googleMapsUri: place.googleMapsUri ?? null,
    websiteUri: place.websiteUri ?? null,
  },
  contact: {
    nationalPhoneNumber: place.nationalPhoneNumber ?? null,
    internationalPhoneNumber: place.internationalPhoneNumber ?? null,
  },
  editorialSummary: place.editorialSummary?.text ?? null,
  generativeSummary: {
    overview: place.generativeSummary?.overview?.text ?? null,
    disclosure: place.generativeSummary?.disclosureText?.text ?? null,
  },
  openingHours: {
    current: {
      openNow: place.currentOpeningHours?.openNow ?? null,
      weekdayDescriptions: place.currentOpeningHours?.weekdayDescriptions ?? [],
    },
    regular: place.regularOpeningHours?.weekdayDescriptions ?? [],
  },
  accessibility: place.accessibilityOptions ?? null,
  utcOffsetMinutes: place.utcOffsetMinutes ?? null,
  timeZone: place.timeZone?.id ?? null,
});

export const collectReviews = (place: GooglePlace) => {
  if (!place.reviews) return [];

  return place.reviews.map((review) => ({
    name: review.name ?? null,
    rating: review.rating ?? null,
    text: review.text?.text ?? review.originalText?.text ?? null,
    language:
      review.text?.languageCode ?? review.originalText?.languageCode ?? null,
    publishTime: review.publishTime ?? null,
    relativePublishTimeDescription:
      review.relativePublishTimeDescription ?? null,
    author: {
      displayName: review.authorAttribution?.displayName ?? null,
      uri: review.authorAttribution?.uri ?? null,
    },
    googleMapsUri: review.googleMapsUri ?? null,
    visitDate: review.visitDate ?? null,
  }));
};
