import { describe, expect, it } from 'vitest'
import { services } from '../src/site/services'
import { briefAnswers, briefProfile, briefProfiles, suggestedChecks, validateServiceBrief } from '../src/lib/service-briefs'
import { clientNextStep } from '../src/lib/workflow'

describe('service briefs', () => {
  it('covers the full catalogue by service code or exact legacy name', () => {
    for (const service of services) {
      expect(briefProfile({service_code:service.calculatorCode,service_name:service.title}).code).not.toBe('custom')
      expect(briefProfile({service_name:service.title}).name).toBe(service.title)
    }
    expect(briefProfile({service_code:'oversight-retainer'}).code).toBe('oversight_retainer')
    expect(briefProfile({engagement:'retainer'}).code).toBe('oversight_retainer')
    expect(briefProfile({service_code:'project_monitoring',engagement:'retainer'}).code).toBe('project_monitoring')
    expect(briefProfile({service_code:'future-service'}).code).toBe('custom')
    expect(briefProfile({service_code:'constructor'}).code).toBe('custom')
  })
  it('supports partial drafts but requires service-specific answers before submission', () => {
    for (const profile of Object.values(briefProfiles)) {
      expect(validateServiceBrief(profile,{},false).brief?.answers).toBeDefined()
      expect(validateServiceBrief(profile,{},true).error).toBeTruthy()
      const answers = Object.fromEntries(profile.fields.filter(f=>f.required).map(f=>[f.key,f.options?.[0]??'Client context']))
      expect(validateServiceBrief(profile,answers,true).error).toBeUndefined()
      expect(validateServiceBrief(profile,answers,true).brief?.profile).toBe(profile.code)
    }
  })
  it('rejects malformed answers even when saving a draft, and ignores unrecognised fields', () => {
    const p=briefProfiles.supplier_verification
    for (const raw of [{website:'javascript:alert(1)'},{relationship:'forged option'},{decision_date:'2026-02-30'},{supplier_name:'x'.repeat(2001)}])
      expect(validateServiceBrief(p,raw,false).error).toBeTruthy()
    const result=validateServiceBrief(p,{supplier_name:'  Trading name  ',outcomes:'wrong service',admin:true,website:'https://example.com'},false)
    expect(result.brief?.answers.supplier_name).toBe('Trading name')
    expect(result.brief?.answers).not.toHaveProperty('admin')
    expect(result.brief?.answers).not.toHaveProperty('outcomes')
  })
  it('never reuses answers from another service or an unsupported version', () => {
    expect(briefAnswers(briefProfiles.feasibility,{version:1,profile:'supplier_verification',answers:{venture_concept:'wrong brief'}})).toEqual({})
    expect(briefAnswers(briefProfiles.feasibility,{version:2,profile:'feasibility',answers:{venture_concept:'future format'}})).toEqual({})
    expect(briefAnswers(briefProfiles.feasibility,{version:1,profile:'feasibility',answers:{venture_concept:'Cold storage',injected:'hidden'}})).toEqual({venture_concept:'Cold storage'})
  })
  it('asks only physical engagements for a site and does not require unavailable registration records', () => {
    expect(Object.values(briefProfiles).filter(p=>p.physicalLocation).map(p=>p.code)).toEqual(['ground_verification','project_monitoring'])
    expect(briefProfiles.supplier_verification.fields.find(f=>f.key==='registration')?.required).toBe(false)
    expect(suggestedChecks(briefProfiles.supplier_verification,'500 units in stock')).toContain('500 units in stock')
    expect(suggestedChecks(briefProfiles.feasibility,null)).toContain('target customers')
  })
  it('guides a supplier client into a supplier brief and supplier activity', () => {
    const p={code:'AVP-101',service_code:'supplier_verification',stage:'onboarding' as const,onboarding_submitted_at:null}
    expect(clientNextStep(p,[],[],null,String).title).toBe('Complete your supplier details')
    expect(clientNextStep({...p,onboarding_submitted_at:new Date()},[],[],null,String).title).toBe('Planning your supplier verification')
  })
})
