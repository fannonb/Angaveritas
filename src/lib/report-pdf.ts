import 'server-only'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ReportSnapshot } from './data/reports'
import { logoPng } from './invoice-logo'

/** Canonical downloadable report: all content comes from the immutable publication snapshot. */
export async function reportPdf(snapshot:ReportSnapshot) {
  const pdf=await PDFDocument.create()
  const {report:r,project:p,findings,evidence}=snapshot
  pdf.setTitle(r.title);pdf.setAuthor('AngaVeritas');pdf.setSubject(`Approved report for ${p.code}`)
  const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo=await pdf.embedPng(Buffer.from(logoPng,'base64'))
  let page=pdf.addPage([595.28,841.89]),y=790
  const safe=(s:string)=>[...s].map(c=>{try{font.encodeText(c);return c}catch{return '?'}}).join('')
  const fresh=()=>{page=pdf.addPage([595.28,841.89]);y=785}
  const line=(s:string,size=10,strong=false)=>{
    if(y<70)fresh()
    page.drawText(safe(s),{x:48,y,size,font:strong?bold:font,color:rgb(.08,.09,.1)});y-=size+5
  }
  const text=(value:string|number|null|undefined,size=10,strong=false)=>{
    const selected=strong?bold:font
    for(const paragraph of String(value??'—').split('\n')) {
      let row=''
      for(const word of safe(paragraph).split(/\s+/)) {
        // Wrap even long hashes/URLs instead of letting them run outside the page.
        for(const part of word.match(/.{1,65}/g)??['']) {
          const next=row?`${row} ${part}`:part
          if(selected.widthOfTextAtSize(next,size)>499&&row){line(row,size,strong);row=part}else row=next
        }
      }
      line(row,size,strong)
    }
  }
  const section=(title:string)=>{if(y<125)fresh();y-=14;text(title,14,true);y-=3}
  page.drawImage(logo,{x:48,y:755,width:145,height:145*logo.height/logo.width});y=725
  text(r.title,20,true);text(`${p.code} · ${p.title}`,11)
  text(`Prepared for ${p.client_name} · ${p.location_label??''}`)
  text(`Published ${r.published_at?new Date(r.published_at).toISOString().slice(0,10):''}`)
  section('Assessment');text(`Overall status: ${r.overall_status??'Not assessed'}`);text(`Recommended decision: ${r.recommended_decision??'See recommendations'}`)
  section('Executive summary');text(r.executive_summary)
  section('Scope');text(r.scope)
  section('Methodology');text(r.methodology)
  section('Findings')
  for(const f of findings){y-=10;text(f.area,12,true);text(`Status: ${f.status} · Confidence: ${f.confidence} · Evidence grade: ${f.evidence_grade??'—'}`);text(f.observation)
    if(f.risk_category)text(`Risk: ${f.risk_category} · Likelihood: ${f.likelihood}/5 · Impact: ${f.impact}/5`)
    text(`Action: ${f.action??'None recorded'}`)
    text(`Evidence: ${f.evidence_ids.map(id=>evidence.find(e=>e.id===id)?.evidence_code??id).join(', ')||'None linked'}`,9)
  }
  section('Recommendations');text(r.recommendations)
  section('Limitations');text(r.limitations)
  section('Evidence register')
  text('Original photos and video are available in the authenticated project archive. The identifiers and hashes below identify the evidence used in this approved report.',9)
  for(const e of evidence){y-=8;text(`${e.evidence_code??e.id} · ${e.filename}`,10,true);text(e.caption,9);text(`Captured: ${e.taken_at??'Not recorded'} · GPS: ${e.gps_lat??'Not recorded'}, ${e.gps_lng??'Not recorded'}`,9);text(`SHA-256: ${e.sha256??'Not recorded'}`,8)}
  section('Approval');text(`Prepared by ${r.author_name??'AngaVeritas'}. Approved by ${r.reviewer_name??'AngaVeritas'}.`)
  const pages=pdf.getPages();pages.forEach((pg,i)=>pg.drawText(`AngaVeritas · ${safe(p.code)} · Confidential · Page ${i+1} of ${pages.length}`,{x:48,y:35,size:8,font,color:rgb(.4,.4,.4)}))
  return pdf.save()
}
