import { expect, it } from 'vitest'
import { defaultPricingConfig } from '@/lib/pricing/config'
import { computeQuote, computeTravel } from '@/lib/pricing/engine'
it('prices approved extra-site fees and each located return trip before urgency', () => {
  const cfg={...defaultPricingConfig,multiSiteFee:5000}
  const quote=computeQuote({serviceCode:'ground_verification',roundTripKm:30,answers:[2,1,1,1,1],addonCodes:[],urgencyCode:'priority',siteCount:3,additionalRoundTripKm:[80,150]},cfg)
  const travel=[30,80,150].reduce((sum,km) => sum+computeTravel(km,cfg).total,0)
  expect(quote.total).toBe(Math.round((15000+travel+10000)*1.25))
  expect(quote.multiSite?.requiresConfirmation).toBe(false)
})
it('marks missing site fees and unlocated travel as incomplete rather than free', () => {
  const quote=computeQuote({serviceCode:'ground_verification',roundTripKm:30,answers:[2,1,1,1,1],addonCodes:[],urgencyCode:'standard',siteCount:3},defaultPricingConfig)
  expect(quote.multiSite?.requiresConfirmation).toBe(true)
})
