// Read-only smoke checks: no accounts, requests, projects or email are created.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin=process.env.BRIEF_SMOKE_ORIGIN||'https://angaveritas.com'
const results=path.resolve('test-results',`brief-smoke-${Date.now()}`)
fs.mkdirSync(results,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const checks=[],errors=[]
const profiles=[
  ['ground_verification','Site or asset location','About the site or asset','Claims about the site or asset'],
  ['supplier_verification','Supplier premises or operating area','About the supplier or contractor','Supplier promises or capacity claims to verify'],
  ['project_monitoring','Project location','Project progress & monitoring plan','Progress claims to verify on the next visit'],
  ['due_diligence','Business premises or operating area','Business & proposed transaction','Business claims to verify'],
  ['feasibility','Study area or target markets','Venture, market & research questions','Assumptions or claims the study should test'],
]
try {
  for(const [code,location,title,claims]of profiles){
    const context=await browser.newContext()
    const page=await context.newPage()
    page.setDefaultTimeout(30000)
    page.on('pageerror',e=>errors.push(e.message))
    const response=await page.goto(`${origin}/estimate?service=${code}`)
    assert.equal(response.status(),200)
    await page.locator('legend').filter({hasText:location}).waitFor()
    await page.getByRole('checkbox',{name:/I don't know the exact location yet/}).check()
    const next=()=>page.getByRole('button',{name:'Continue',exact:true}).click()
    await next()
    for(const name of ['locations','stakeholders','documents','fieldwork','report'])await page.locator(`input[name="${name}"]`).first().check()
    await next();await next();await next()
    await page.locator('legend').filter({hasText:title}).waitFor()
    await page.getByLabel(claims,{exact:false}).waitFor()
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:1000})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
      await page.screenshot({path:path.join(results,`${code}-${width}.png`),fullPage:true})
    }
    checks.push(code);console.log(`PASS live ${code} intake guidance`)
    await context.close()
  }
  assert.deepEqual(errors,[])
}catch(error){console.error(error);process.exitCode=1}
finally{
  await browser.close()
  fs.writeFileSync(path.join(results,'checks.json'),JSON.stringify({origin,checks,errors},null,2))
  console.log(`${checks.length} live service checks passed. Evidence: ${results}`)
}
