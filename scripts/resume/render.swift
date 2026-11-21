import AppKit
import PDFKit
import CoreText
import Foundation

let root=CommandLine.arguments[1]
let content=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:root+"/scripts/resume/content.json"))) as! [String:Any]
let W:CGFloat=595.276, H:CGFloat=841.89, M:CGFloat=35, CW:CGFloat=525.276
let ink=NSColor(calibratedRed:0.09,green:0.17,blue:0.25,alpha:1)
let teal=NSColor(calibratedRed:0.07,green:0.39,blue:0.42,alpha:1)
let muted=NSColor(calibratedRed:53.0/255,green:71.0/255,blue:88.0/255,alpha:1)
let line=NSColor(calibratedRed:148.0/255,green:168.0/255,blue:176.0/255,alpha:1)
var bounds=CGRect(x:0,y:0,width:W,height:H)
let path=root+"/assets/resume.pdf"
let pdf=CGContext(URL(fileURLWithPath:path) as CFURL,mediaBox:&bounds,[kCGPDFContextTitle:"Anchit Tandon | Senior Product Manager & AI Builder",kCGPDFContextAuthor:"Anchit Tandon"] as CFDictionary)!
var annotations:[(CGRect,String)]=[]

@discardableResult func text(_ s:String,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat,_ size:CGFloat=10.1,_ bold:Bool=false,_ color:NSColor=ink,_ link:String?=nil)->CGFloat{
 let para=NSMutableParagraphStyle();para.lineSpacing=1.7;para.lineBreakMode = .byWordWrapping
 let font=NSFont(name:bold ? "Arial-BoldMT":"ArialMT",size:size) ?? NSFont.systemFont(ofSize:size,weight:bold ? .bold:.regular)
 let a=NSAttributedString(string:s,attributes:[.font:font,.foregroundColor:color,.paragraphStyle:para])
 let h=ceil(a.boundingRect(with:NSSize(width:width,height:2000),options:[.usesLineFragmentOrigin,.usesFontLeading]).height)
 a.draw(with:CGRect(x:x,y:y,width:width,height:h+2),options:[.usesLineFragmentOrigin,.usesFontLeading])
 if let l=link{annotations.append((CGRect(x:x,y:H-y-h,width:width,height:h),l))}
 if y+h > H-35 {print("OVERFLOW",s.prefix(45),y+h)}
 return h
}
func rule(_ y:CGFloat){line.setStroke();let p=NSBezierPath();p.move(to:NSPoint(x:M,y:y));p.line(to:NSPoint(x:W-M,y:y));p.lineWidth=0.55;p.stroke()}
func metricText(_ s:String,_ centerX:CGFloat,_ baseline:CGFloat,_ size:CGFloat,_ bold:Bool,_ color:NSColor){
 let font=NSFont(name:bold ? "Arial-BoldMT":"ArialMT",size:size)!
 let a=NSAttributedString(string:s,attributes:[.font:font,.foregroundColor:color])
 let ctLine=CTLineCreateWithAttributedString(a)
 let width=CGFloat(CTLineGetTypographicBounds(ctLine,nil,nil,nil))
 pdf.saveGState();pdf.textMatrix=CGAffineTransform(scaleX:1,y:-1)
 pdf.textPosition=CGPoint(x:centerX-width/2,y:baseline);CTLineDraw(ctLine,pdf);pdf.restoreGState()
}
func section(_ s:String,_ y:inout CGFloat){y+=7;y+=text(s,M,y,CW,9,true,teal)+4;rule(y);y+=6}
func start(){pdf.beginPDFPage(nil);pdf.saveGState();pdf.translateBy(x:0,y:H);pdf.scaleBy(x:1,y:-1);NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:pdf,flipped:true)}
func finish(_ page:Int){rule(H-32);text("Anchit Tandon · anchit-tandon.com",M,H-25,CW-40,7.7,false,muted,"https://anchit-tandon.com");text("\(page) / 2",W-M-32,H-25,32,7.7,false,muted);NSGraphicsContext.restoreGraphicsState();pdf.restoreGState();for (r,l) in annotations {pdf.setURL(URL(string:l)! as CFURL,for:r)};annotations=[];pdf.endPDFPage()}
func bullet(_ s:String,_ y:inout CGFloat,_ size:CGFloat=10){text("•",M+1,y,8,size,false,teal);y+=text(s,M+12,y,CW-12,size)+4}
func heading(_ title:String,_ dates:String,_ y:inout CGFloat){y+=4;text(dates,W-M-108,y+1,108,8.1,false,muted);y+=text(title,M,y,CW-115,10.3,true)+2}

start()
var y:CGFloat=31
y+=text("Anchit Tandon",M,y,CW,29,true)+3
y+=text("SENIOR PRODUCT MANAGER & AI BUILDER",M,y,CW,10.8,true,teal)+4
y+=text("Technical Product Management · AI Agents · D2C Growth",M,y,CW,9.1,false,muted)+6
y+=text("Delhi, India  |  +91 98739 45238  |  anchit.tandon@gmail.com",M,y,CW,8.7)+3
y+=text("Open to full-time Senior PM roles  ·  Remote or Delhi NCR  ·  Available to join immediately",M,y,CW,8.4,false,muted)+3
text("anchit-tandon.com",M,y,140,8.7,false,teal,"https://anchit-tandon.com")
y+=text("linkedin.com/in/anchit-tandon",M+143,y,300,8.7,false,teal,"https://linkedin.com/in/anchit-tandon")+10
NSColor(calibratedRed:0.96,green:0.975,blue:0.975,alpha:1).setFill();NSBezierPath(rect:CGRect(x:M,y:y,width:CW,height:89)).fill()
let projectCount=(content["projects"] as! [[String:String]]).count
let metrics=[("5×","ET Prime · ₹15L to ₹80L/mo"),("400%+","ROI · ET Prime · Six months"),("₹3Cr+","Annual revenue · ET Markets"),("+27%","Engagement · ET Markets"),("+25%","Daily active users · ET Markets"),("150+","Qualified leads/day · from ~30"),("18K+","Runners · Delhi Half Marathon"),("\(projectCount)","Products built")]
for col in 1...3 {let x=M+CGFloat(col)*(CW/4);line.setStroke();let p=NSBezierPath();p.move(to:NSPoint(x:x,y:y+10));p.line(to:NSPoint(x:x,y:y+79));p.lineWidth=0.45;p.stroke()}
for (i,m) in metrics.enumerated(){let centerX=M+(CGFloat(i%4)+0.5)*(CW/4);let rowY=y+CGFloat(i/4)*44.5;metricText(m.0,centerX,rowY+20,14.2,true,ink);metricText(m.1,centerX,rowY+35,7.2,false,muted)}
y+=96
section("PROFILE",&y)
y+=text(content["profile"] as! String,M,y,CW,10.1)+2
section("PROFESSIONAL EXPERIENCE",&y)
for r in content["roles"] as! [[String:Any]]{
 heading(r["title"] as! String,r["dates"] as! String,&y)
 y+=text(r["sub"] as! String,M,y,CW,8.4,false,muted)+4
 if let previous=r["previous_roles"] as? String { y+=text(previous,M,y,CW,8.6,true,teal)+4 }
 for b in r["bullets"] as! [String]{bullet(b,&y,9.8)}
 y+=2
}
print("Page 1 content ends:",y)
precondition(y <= H-38, "Page 1 content overflows the footer: \(y) > \(H-38)")
finish(1)

start();y=29
text("ANCHIT TANDON",M,y,300,12,true);text("EXPERIENCE & COMPLETE PORTFOLIO",M+240,y,285,8.3,true,teal);y+=23
section("EARLIER TECHNICAL EXPERIENCE",&y)
heading("Citymall | Software Engineer (SDE II)","Mar 2022 - Jun 2022",&y)
bullet("Built and scaled backend systems supporting high-frequency consumer transactions on a consumer-commerce platform.",&y,9.3)
bullet("Improved data pipelines and API performance to support growth and reliability.",&y,9.3)
heading("Tuple Technologies | Software Engineer & Product Owner","Apr 2020 - Mar 2022",&y)
bullet("Appointed Product Owner for Chatter (now DebatabL), a live football commentary app; led the MVP from ideation to launch, driving early user engagement and adoption.",&y,9.3)
bullet("Built APIs and backend systems for consumer and hyperlocal commerce products.",&y,9.3)
bullet("Supported growth initiatives through onboarding, distribution and early go-to-market efforts.",&y,9.3)
section("CORE SKILLS",&y)
y+=text("Product: Discovery, strategy, roadmaps, prioritisation, A/B experimentation, pricing and monetisation.",M,y,CW,9.1)+3
y+=text("AI & engineering: Agents, RAG/pgvector, tool calling, model routing, Python, TypeScript, Next.js, Supabase.",M,y,CW,9.1)+3
y+=text("Growth & analytics: Funnels, subscriptions, lifecycle CRM, SQL, Klaviyo, WebEngage, Mixpanel and Shopify.",M,y,CW,9.1)+3
y+=text("Tools & stack: React, Node.js, Vercel, Figma, Jira.",M,y,CW,9.1)+3
section("EDUCATION",&y)
let educationX:[CGFloat]=[M,M+176,M+399,M+471]
let educationW:[CGFloat]=[170,217,66,54]
for (i,label) in ["Qualification","Institution","Result","Year"].enumerated(){text(label,educationX[i],y,educationW[i],7.5,false,muted)}
y+=14
let educationRows=[
 ["B.Tech, Computer Science & Engineering","Vellore Institute of Technology, Vellore","7.81 CGPA","2016-2020"],
 ["Class XII · CBSE","Delhi Public School, R.K. Puram","95%","2016"],
 ["Class X · CBSE","Delhi Public School, R.K. Puram","10/10 CGPA","2014"]
]
for row in educationRows{
 var height:CGFloat=0
 for i in 0...3 {height=max(height,text(row[i],educationX[i],y,educationW[i],8.6,i==0))}
 y+=height+3
}
section("COMPLETE PRODUCT PORTFOLIO | \(projectCount) PRODUCTS",&y)
y+=2
 let top=y, colW:CGFloat=(CW-22)/2
let projects=content["projects"] as! [[String:String]]
var ends:[CGFloat]=[]
for col in 0...1 {
 let split=(projects.count+1)/2
 let range=col==0 ? 0..<split:split..<projects.count
 let x=M+CGFloat(col)*(colW+22);var cy=top
 for i in range{
  let p=projects[i]
  cy+=text(p["name"]!,x,cy,colW,9.2,true,ink,p["url"]!)+0.5
  cy+=text(p["text"]!,x,cy,colW,9.05)-0.5
  let visibleURL="URL: "+p["url"]!
  cy+=text(visibleURL,x,cy,colW,7.3,false,teal,p["url"]!)+1.5
 }
 ends.append(cy)
}
print("Page 2 portfolio start:",top,"column ends:",ends)
precondition(ends.max()! <= H-38, "Page 2 content overflows the footer: \(ends)")
finish(2);pdf.closePDF()
let doc=PDFDocument(url:URL(fileURLWithPath:path))!
print("Pages:",doc.pageCount)
precondition(doc.pageCount == 2, "Resume must remain two pages")

