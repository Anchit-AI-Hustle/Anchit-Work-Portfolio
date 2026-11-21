import AppKit
import PDFKit
import CoreText
import Foundation

// Two-page resume, drawn from scripts/resume/content.json.
// Palette follows DESIGN.md: near-black band, warm cream, orange for action, gold for craft.
let root=CommandLine.arguments[1]
let content=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:root+"/scripts/resume/content.json"))) as! [String:Any]
let W:CGFloat=595.276, H:CGFloat=841.89, M:CGFloat=35, CW:CGFloat=525.276
func rgb(_ hex:Int)->NSColor{NSColor(calibratedRed:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:1)}
let night=rgb(0x0F0D0A), cream=rgb(0xFBF5EC), creamDim=rgb(0xCFC8BC)
let ink=rgb(0x15120E), dim=rgb(0x4F4A43), hair=rgb(0xDDD5C8), paper=rgb(0xF6F1E8)
let orange=rgb(0xE8471A), gold=rgb(0xC9A96E), goldDeep=rgb(0x8A6A2F)
var bounds=CGRect(x:0,y:0,width:W,height:H)
let path=root+"/assets/resume.pdf"
let pdf=CGContext(URL(fileURLWithPath:path) as CFURL,mediaBox:&bounds,[kCGPDFContextTitle:"Anchit Tandon | Senior Product Manager & AI Builder",kCGPDFContextAuthor:"Anchit Tandon"] as CFDictionary)!
var annotations:[(CGRect,String)]=[]

enum Face{case sans,sansBold,serif,serifBold,serifItalic,mono,monoBold}
func font(_ f:Face,_ size:CGFloat)->NSFont{
 let name:String
 switch f{case .sans:name="ArialMT";case .sansBold:name="Arial-BoldMT";case .serif:name="Georgia";case .serifBold:name="Georgia-Bold";case .serifItalic:name="Georgia-Italic";case .mono:name="Menlo-Regular";case .monoBold:name="Menlo-Bold"}
 return NSFont(name:name,size:size) ?? NSFont.systemFont(ofSize:size)
}
func para()->NSMutableParagraphStyle{let p=NSMutableParagraphStyle();p.lineSpacing=1.7;p.lineBreakMode = .byWordWrapping;return p}
func attr(_ s:String,_ f:Face,_ size:CGFloat,_ color:NSColor,_ kern:CGFloat=0)->NSAttributedString{
 NSAttributedString(string:s,attributes:[.font:font(f,size),.foregroundColor:color,.paragraphStyle:para(),.kern:kern])}
@discardableResult func draw(_ a:NSAttributedString,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat,_ link:String?=nil)->CGFloat{
 let h=ceil(a.boundingRect(with:NSSize(width:width,height:2000),options:[.usesLineFragmentOrigin,.usesFontLeading]).height)
 a.draw(with:CGRect(x:x,y:y,width:width,height:h+2),options:[.usesLineFragmentOrigin,.usesFontLeading])
 if let l=link{annotations.append((CGRect(x:x,y:H-y-h,width:width,height:h),l))}
 return h
}
@discardableResult func text(_ s:String,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat,_ f:Face = .sans,_ size:CGFloat=9.8,_ color:NSColor=ink,_ link:String?=nil,_ kern:CGFloat=0)->CGFloat{
 draw(attr(s,f,size,color,kern),x,y,width,link)}
func measure(_ a:NSAttributedString,_ width:CGFloat)->CGFloat{ceil(a.boundingRect(with:NSSize(width:width,height:2000),options:[.usesLineFragmentOrigin,.usesFontLeading]).height)}
func width(_ s:String,_ f:Face,_ size:CGFloat,_ kern:CGFloat=0)->CGFloat{ceil(attr(s,f,size,ink,kern).size().width)}
func fill(_ c:NSColor,_ r:CGRect){c.setFill();NSBezierPath(rect:r).fill()}
func hline(_ x1:CGFloat,_ x2:CGFloat,_ y:CGFloat,_ c:NSColor=hair,_ w:CGFloat=0.6){c.setStroke();let p=NSBezierPath();p.move(to:NSPoint(x:x1,y:y));p.line(to:NSPoint(x:x2,y:y));p.lineWidth=w;p.stroke()}
func centered(_ s:String,_ f:Face,_ size:CGFloat,_ color:NSColor,_ cx:CGFloat,_ baseline:CGFloat,_ kern:CGFloat=0){
 let a=NSAttributedString(string:s,attributes:[.font:font(f,size),.foregroundColor:color,.kern:kern])
 let l=CTLineCreateWithAttributedString(a);let w=CGFloat(CTLineGetTypographicBounds(l,nil,nil,nil))
 pdf.saveGState();pdf.textMatrix=CGAffineTransform(scaleX:1,y:-1);pdf.textPosition=CGPoint(x:cx-w/2,y:baseline);CTLineDraw(l,pdf);pdf.restoreGState()
}
func section(_ s:String,_ y:inout CGFloat){
 y+=9
 fill(orange,CGRect(x:M,y:y+2.5,width:10,height:2.2))
 let h=text(s,M+16,y,CW-16,.monoBold,8,orange,nil,1.1)
 hline(M+20+width(s,.monoBold,8,1.1),W-M,y+h/2+0.5)
 y+=h+6
}
func heading(_ title:String,_ dates:String,_ y:inout CGFloat){
 y+=4
 text(dates,W-M-110,y+1.5,110,.sans,8,dim)
 y+=text(title,M,y,CW-118,.sansBold,10.4)+2
}
func richBullet(_ lead:String,_ rest:String,_ y:inout CGFloat,_ size:CGFloat=9.5,_ draws:Bool=true)->CGFloat{
 let a=NSMutableAttributedString(attributedString:attr(lead+" ",.sansBold,size,ink));a.append(attr(rest,.sans,size,dim))
 let h=measure(a,CW-12)
 if draws{fill(orange,CGRect(x:M+1.5,y:y+4.6,width:3.4,height:3.4));draw(a,M+12,y,CW-12);y+=h+2.6}
 return h+2.6
}
func plainBullet(_ s:String,_ y:inout CGFloat,_ draws:Bool=true)->CGFloat{
 let a=attr(s,.sans,9.2,dim);let h=measure(a,CW-12)
 if draws{fill(gold,CGRect(x:M+1.5,y:y+4.4,width:3.2,height:3.2));draw(a,M+12,y,CW-12);y+=h+3}
 return h+3
}
func start(){pdf.beginPDFPage(nil);pdf.saveGState();pdf.translateBy(x:0,y:H);pdf.scaleBy(x:1,y:-1);NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:pdf,flipped:true)}
func finish(_ page:Int){
 hline(M,W-M,H-32)
 text("Anchit Tandon  ·  anchit-tandon.com",M,H-25,CW-40,.mono,7,dim,"https://anchit-tandon.com")
 text("\(page) / 2",W-M-30,H-25,30,.mono,7,dim)
 NSGraphicsContext.restoreGraphicsState();pdf.restoreGState()
 for (r,l) in annotations {pdf.setURL(URL(string:l)! as CFURL,for:r)};annotations=[];pdf.endPDFPage()
}

// ---------- Page 1 ----------
start()
let bandH:CGFloat=128
fill(night,CGRect(x:0,y:0,width:W,height:bandH))
fill(orange,CGRect(x:0,y:bandH-3,width:W,height:3))
var y:CGFloat=24
y+=text("Anchit Tandon",M,y,CW,.serif,30,cream)+2
y+=text("SENIOR PRODUCT MANAGER & AI BUILDER",M,y,CW,.monoBold,8.4,orange,nil,1.6)+5
y+=text(content["tagline"] as! String,M,y,CW,.serifItalic,10.8,gold)+3
y+=text(content["summary"] as! String,M,y,CW,.sans,8.4,creamDim)+6
// contact line, links in orange
let parts:[(String,String?)]=[("Delhi, India",nil),("+91 98739 45238","tel:+919873945238"),("anchit.tandon@gmail.com","mailto:anchit.tandon@gmail.com"),("anchit-tandon.com","https://anchit-tandon.com"),("linkedin.com/in/anchit-tandon","https://linkedin.com/in/anchit-tandon")]
var lx=M
for (i,(s,l)) in parts.enumerated(){
 let w=width(s,.sans,8.3)
 text(s,lx,y,w+2,.sans,8.3,l==nil ? creamDim:cream,l)
 lx+=w
 if i<parts.count-1 {text("  /  ",lx,y,24,.sans,8.3,orange);lx+=width("  /  ",.sans,8.3)}
}
y=bandH+12

// signature wins
let wins=content["wins"] as! [[String:String]]
let gap:CGFloat=12, cardW=(CW-gap*2)/3, cardH:CGFloat=63
for (i,w) in wins.enumerated(){
 let x=M+CGFloat(i)*(cardW+gap)
 fill(paper,CGRect(x:x,y:y,width:cardW,height:cardH))
 fill(orange,CGRect(x:x,y:y,width:cardW,height:2.2))
 text(w["value"]!,x+10,y+6,cardW-20,.serifBold,20,orange)
 text(w["title"]!.uppercased(),x+10,y+30,cardW-20,.monoBold,6.6,ink,nil,0.6)
 text(w["text"]!,x+10,y+39.5,cardW-14,.sans,7.4,dim)
}
y+=cardH+7
// secondary metrics line
let ms=NSMutableAttributedString()
for (i,m) in (content["metrics"] as! [[String]]).enumerated(){
 if i>0 {ms.append(attr("     ",.sans,8,dim))}
 ms.append(attr(m[0]+" ",.sansBold,8.4,ink));ms.append(attr(m[1],.sans,8,dim))
}
y+=draw(ms,M,y,CW)+2

// career line
section("CAREER LINE",&y)
let tl=content["timeline"] as! [[String]]
let step=CW/CGFloat(tl.count)
let lineY=y+15
hline(M+step/2,W-M-step/2,lineY,gold,1.1)
for (i,t) in tl.enumerated(){
 let cx=M+step*(CGFloat(i)+0.5)
 let current=(i==tl.count-1)
 let promo=(t[2]=="Times Internet")
 centered(t[0].uppercased(),.mono,6.4,dim,cx,lineY-6,0.3)
 let r:CGFloat=current ? 4.2:3.2
 (current||promo ? orange:night).setFill();NSBezierPath(ovalIn:CGRect(x:cx-r,y:lineY-r,width:r*2,height:r*2)).fill()
 centered(t[1],.sansBold,8,ink,cx,lineY+15)
 centered(t[2],.sans,6.9,dim,cx,lineY+24.5)
}
y=lineY+31

// experience
section("EXPERIENCE",&y)
for r in content["roles"] as! [[String:Any]]{
 heading(r["title"] as! String,r["dates"] as! String,&y)
 y+=text(r["sub"] as! String,M,y,CW,.sans,8.3,dim)+3
 if let p=r["previous_roles"] as? String { y+=text(p,M,y,CW,.sansBold,8.4,orange)+4 }
 for b in r["bullets"] as! [[String]]{_=richBullet(b[0],b[1],&y)}
 y+=1
}

// earlier technical experience, flowing onto page 2 when page 1 fills
var page=1, inEarlier=false
let limit=H-38
func pageTwo(_ y:inout CGFloat){
 print("Page 1 content ends:",y);precondition(y <= limit,"Page 1 content overflows the footer: \(y) > \(limit)")
 finish(1);start()
 fill(night,CGRect(x:0,y:0,width:W,height:34));fill(orange,CGRect(x:0,y:32,width:W,height:2))
 text("Anchit Tandon",M,10,260,.serif,13,cream)
 let label="BUILDS, SKILLS & EDUCATION"
 text(label,W-M-width(label,.monoBold,7.4,1.2)-2,14,width(label,.monoBold,7.4,1.2)+4,.monoBold,7.4,orange,nil,1.2)
 y=46;page=2
 if inEarlier {y+=text("EARLIER TECHNICAL EXPERIENCE, CONTINUED",M,y,CW,.monoBold,7.2,dim,nil,0.8)+4}
}
let earlier=content["earlier"] as! [[String:Any]]
var scratch:CGFloat=0
func headH(_ t:String)->CGFloat{4+measure(attr(t,.sansBold,10.4,ink),CW-118)+2}
let firstEarlier=earlier[0], firstBullets=firstEarlier["bullets"] as! [String]
if y+30+headH(firstEarlier["title"] as! String)+plainBullet(firstBullets[0],&scratch,false) > limit {pageTwo(&y)}
section("EARLIER TECHNICAL EXPERIENCE",&y);inEarlier=true
for e in earlier{
 let title=e["title"] as! String, bullets=e["bullets"] as! [String]
 if page==1 && y+headH(title)+plainBullet(bullets[0],&scratch,false) > limit {pageTwo(&y)}
 heading(title,e["dates"] as! String,&y)
 for b in bullets{ if page==1 && y+plainBullet(b,&scratch,false) > limit {pageTwo(&y)}; _=plainBullet(b,&y) }
}
inEarlier=false
if page==1 {pageTwo(&y)}

// ---------- Page 2 ----------
let projects=content["projects"] as! [[String:String]]
let urlOf=Dictionary(uniqueKeysWithValues:projects.map{($0["name"]!,$0["url"]!)})
section("FEATURED BUILDS",&y)
let featured=content["featured"] as! [[String:String]]
let fcolW=(CW-14)/2
var row=0
while row*2<featured.count{
 var hs:[CGFloat]=[]
 for c in 0...1 where row*2+c<featured.count{
  let f=featured[row*2+c]
  let hook=attr(f["hook"]!,.sansBold,8.6,ink), proof=attr(f["proof"]!,.sans,8,dim)
  hs.append(4+13+measure(hook,fcolW-14)+2+measure(proof,fcolW-14)+3+10+5)
 }
 let rowH=hs.max()!
 for c in 0...1 where row*2+c<featured.count{
  let f=featured[row*2+c], x=M+CGFloat(c)*(fcolW+14), url=urlOf[f["name"]!]!
  fill(paper,CGRect(x:x,y:y,width:fcolW,height:rowH))
  fill(orange,CGRect(x:x,y:y,width:2.2,height:rowH))
  var cy=y+5
  cy+=text(f["name"]!,x+10,cy,fcolW-14,.serifBold,10.6,ink,url)+1
  cy+=text(f["hook"]!,x+10,cy,fcolW-14,.sansBold,8.6,ink)+2
  cy+=text(f["proof"]!,x+10,cy,fcolW-14,.sans,8,dim)+3
  let shown=url.replacingOccurrences(of:"https://",with:"").trimmingCharacters(in:CharacterSet(charactersIn:"/"))
  text(shown,x+10,cy,fcolW-14,.mono,6.6,orange,url)
 }
 y+=rowH+8;row+=1
}

section("ALL \(projects.count) PRODUCTS",&y)
let featuredNames=Set(featured.map{$0["name"]!})
let rest=projects.filter{!featuredNames.contains($0["name"]!)}
let icolW=(CW-18)/2, split=(rest.count+1)/2
var ends:[CGFloat]=[]
let indexTop=y
for c in 0...1{
 var cy=indexTop, x=M+CGFloat(c)*(icolW+18)
 for p in rest[(c==0 ? 0:split)..<(c==0 ? split:rest.count)]{
  let a=NSMutableAttributedString(attributedString:attr(p["name"]!+"  ",.sansBold,8.4,ink));a.append(attr(p["text"]!,.sans,7.9,dim))
  cy+=draw(a,x,cy,icolW,p["url"]!)+3.4
 }
 ends.append(cy)
}
y=ends.max()!
y+=text("Every build links to its live page; the full list is at anchit-tandon.com/#projects",M,y+1,CW,.mono,6.8,dim,"https://anchit-tandon.com/#projects")+2

section("CORE SKILLS",&y)
for s in content["skills"] as! [[String]]{
 let a=NSMutableAttributedString(attributedString:attr(s[0]+":  ",.sansBold,8.9,ink));a.append(attr(s[1],.sans,8.9,dim))
 y+=draw(a,M,y,CW)+2.5
}
section("EDUCATION",&y)
let ex:[CGFloat]=[M,M+176,M+399,M+471], ew:[CGFloat]=[170,217,66,54]
for row in content["education"] as! [[String]]{
 var h:CGFloat=0
 for i in 0...3 {h=max(h,text(row[i],ex[i],y,ew[i],i==0 ? .sansBold:.sans,8.6,i==0 ? ink:dim))}
 y+=h+3
}
print("Page 2 content ends:",y)
precondition(y <= limit,"Page 2 content overflows the footer: \(y) > \(limit)")
finish(2);pdf.closePDF()
let doc=PDFDocument(url:URL(fileURLWithPath:path))!
print("Pages:",doc.pageCount)
precondition(doc.pageCount == 2,"Resume must remain two pages")
