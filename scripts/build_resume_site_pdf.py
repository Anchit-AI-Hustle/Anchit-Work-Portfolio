#!/usr/bin/env python3
"""Public CV PDF generator. Outputs the two-page, 23-project November 2026 resume."""
import os, html
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, '..', 'assets', 'resume.pdf'))
FONTDIRS = ['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/dejavu2']
for d in FONTDIRS:
    if os.path.exists(os.path.join(d,'DejaVuSans.ttf')): break
else: raise RuntimeError('DejaVu Sans font missing; install fonts-dejavu-core')
pdfmetrics.registerFont(TTFont('LS', os.path.join(d,'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('LSB', os.path.join(d,'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('LSI', os.path.join(d,'DejaVuSans-Oblique.ttf')))
pdfmetrics.registerFontFamily('LS', normal='LS', bold='LSB', italic='LSI', boldItalic='LSB')
W,H=A4
C=canvas.Canvas(OUT,pagesize=A4,pageCompression=1)
C.setTitle('Anchit Tandon | Senior Product Manager and AI Builder | 2026')
G=colors.HexColor('#926B25'); D=colors.HexColor('#1F1F1F'); M=colors.HexColor('#5E5B58'); BEIGE=colors.HexColor('#F4F0E8')
L=44; R=W-44; CW=R-L

def txt(s,x,y,size=9,font='LS',color=D):
 C.setFont(font,size); C.setFillColor(color); C.drawString(x,y,s)
def right(s,x,y,size=8.5,font='LS',color=M):
 C.setFont(font,size); C.setFillColor(color); C.drawRightString(x,y,s)
def center(s,x,y,size=8,font='LS',color=M):
 C.setFont(font,size); C.setFillColor(color); C.drawCentredString(x,y,s)
def para(content, x, y, width, size=8.8, leading=11.3, color=D, after=3):
 st=ParagraphStyle('p',fontName='LS',fontSize=size,leading=leading,textColor=color,spaceAfter=0,allowWidows=0,allowOrphans=0)
 p=Paragraph(content,st)
 _, h=p.wrap(width,1000)
 p.drawOn(C,x,y-h)
 return y-h-after

def section(label,y):
 txt(label.upper(),L,y,10,'LSB')
 C.setStrokeColor(G); C.setLineWidth(.6); C.line(L,y-6,R,y-6)
 return y-22

def role(title, date, desc, y):
 txt(title,L,y,9.0,'LSB');right(date,R,y,8.2)
 if desc: txt(desc,L+4,y-13,8.1,'LSI',M); return y-25
 return y-13

def bullet(content,y):
 C.setFillColor(G);C.circle(L+4,y-5,1.65,fill=1,stroke=0)
 return para(content,L+13,y,CW-13,8.6,10.6,after=3)

def footer():
 right('Anchit Tandon   ·   anchit-tandon.com',R,26,7.3,'LS',M)

# PAGE ONE
C.setAuthor('Anchit Tandon')
txt('Anchit Tandon',L,800,22,'LSB')
txt('SENIOR PRODUCT MANAGER & AI BUILDER',L,780,10,'LSB',G)
txt('Technical Product Management  ·  AI Agents  ·  D2C Growth',L+254,780,8.3,'LS',M)
txt('Delhi, India  |  +91 98739 45238  |  anchit.tandon@gmail.com  |  anchit-tandon.com  |  linkedin.com/in/anchit-tandon',L,765,8.1,'LS',M)
metrics=[('5× REVENUE','₹15L → ₹80L/month'),('400%+ ROI','ET Prime · 6 months'),('₹3Cr+','Added annual revenue'),('+27%','ET Markets engagement'),('+25% DAU','ET Markets apps'),('150+ LEADS/DAY','Up from ~30/day'),('15,000+','Marathon participants'),('20+ BUILDS','Products & demos')]
cellw=CW/4
for i,(top,sub) in enumerate(metrics):
 col=i%4;row=i//4;x=L+col*cellw;y=747-row*24
 C.setFillColor(BEIGE);C.rect(x,y-23,cellw-.5,24,fill=1,stroke=0)
 center(top,x+cellw/2,y-8.5,9.3,'LSB',G)
 center(sub,x+cellw/2,y-19,7.1,'LS',M)

y=675
y=section('Profile',y)
y=para('An engineer who learned to love the funnel. I’m a product manager who builds to solve a problem: most PMs write the specs, I build them myself. I began in backend engineering and moved into product at Times Internet, working on assisted sales, subscriptions and consumer experiences, before taking on international D2C product and growth at VAHDAM. I helped grow assisted-sales revenue from ₹15L to ₹80L a month and ET Markets revenue by ₹3Cr+ annually. These days I build and test AI agents and products myself, from understanding the problem to getting a working solution into people’s hands.',L,y,CW,8.8,11.1,after=17)
y=section('Core skills',y)
y=para('<b>Product:</b> Customer discovery · Product strategy &amp; roadmaps · PRDs and prioritisation · 0→1 launches · Experimentation · Monetisation',L,y,CW,8.7,11,after=3)
y=para('<b>AI &amp; engineering:</b> LLMs &amp; AI agents · RAG/pgvector · Tool calling · Model routing &amp; fallbacks · Human approval gates · Python · TypeScript · Next.js · Supabase',L,y,CW,8.7,11,after=3)
y=para('<b>Growth &amp; analytics:</b> Conversion funnels · Subscription retention · D2C · Lifecycle CRM · SQL · Analytics · Klaviyo · WebEngage · Mixpanel',L,y,CW,8.7,11,after=12)
y=section('Professional experience',y)
y=role('Parwah  |  Independent Product Builder','Sep 2026 – Present','Family care for India · Product, design and engineering',y)
y=bullet('Building a family-care app for relatives coordinating support for ageing parents across cities. <b>Own the product, UX and implementation</b> from early decisions to the working website.',y)
y=bullet('Designed around a trust problem rather than a tracking feature: parents decide what to share, see who has access and can revoke it in one tap. Kept the experience senior-first with large text and simple navigation.',y)
y-=11
y=role('VAHDAM India  |  AGM, Product Management & D2C Growth','Apr 2026 – Sep 2026','US, UK and global D2C markets',y)
y=bullet('Worked across international customer journeys and conversion funnels, identifying friction and testing ways to improve product and CRM performance.',y)
y=bullet('Helped bring analytics, customer segmentation, campaign planning and mailer creation into one <b>lifecycle and retention workflow</b> instead of separate processes.',y)
y=bullet('Ran experiments using Klaviyo and WebEngage, contributing to an increase in UK marketing revenue within the first two months.',y)
y-=11
y=role('Times Internet  |  APM → Product Manager → Senior Product Manager','Jun 2022 – Apr 2026','ET Prime · ET Markets · Times Health+ · Delhi Half Marathon',y)
y=bullet('Took ET Prime assisted-sales revenue from <b>₹15L to ₹80L/month in four months</b> by improving lead journeys, call flows and ongoing A/B tests.',y)
y=bullet('Built a structured assisted-conversion programme that delivered <b>400%+ ROI in six months</b>; received the 2025 ET Prime Team Award as part of the team.',y)
y=bullet('Built AI TeleSuite to transcribe sales calls, score conversations and provide pitch guidance so teams could review and improve their calls more consistently.',y)
y=bullet('Led the ET Markets web and mobile-web redesign: <b>+27% engagement and ₹3Cr+ incremental annual revenue.</b>',y)
y=bullet('Improved the Android and iOS experience, contributing to <b>+25% DAU, +15% session duration and +19% screen views.</b>',y)
y=bullet('Created assisted-buying journeys that raised qualified leads from ~30 to <b>150+ per day</b>; onboarding and engagement experiments improved subscriber retention by <b>10%.</b>',y)
y=bullet('Launched Times Health+ paid subscription journeys and helped take the first Times Internet Delhi Half Marathon from concept to registration and acquisition for <b>15,000+ participants.</b>',y)
if y<39: raise RuntimeError(f'First page overlaps footer: {y}')
footer();C.showPage()

# PAGE TWO
y=797
y=section('Earlier technical experience',y)
y=role('Citymall  |  Software Engineer','Mar 2022 – Jun 2022','',y)
y=bullet('Worked on backend services and data pipelines for consumer-commerce applications.',y)
y-=13
y=role('Tuple Technologies  |  Software Engineer & Product Owner','Apr 2020 – Mar 2022','',y)
y=bullet('Built backend services for consumer apps and took product ownership of an early live-sports-commentary product.',y)
y-=6
y=section('AI and product portfolio | 23 projects and prototypes',y)
left=[
 ('LifeCycle-OS','Lifecycle marketing platform for campaign planning, emails, ads and landing pages.'),
 ('The Third Eye','Personal AI operating system combining memory, tool use, voice and task workflows.'),
 ('AI TeleSuite','Transcription, call scoring and pitch coaching for high-intent sales teams.'),
 ('Mailer Architect','Multi-model workflow generating brand-aligned email campaigns and HTML mailers.'),
 ('The How-To Engine','AI-guided step-by-step learning with answer comparison and quality checks.'),
 ('JobHunt','AI-assisted job search, application tracking and tailored resume workflows.'),
 ('Anchit LLM','Interactive portfolio assistant that answers questions about my products and work.'),
 ('Predict Natural Disasters','Global hazard map using official feeds, forecasts and evidence checks.'),
 ('Markets Pro','Multi-market strategy research and paper trading; being refined.'),
 ('Kolab','Creator–brand collaboration product with analytics and account integrations.'),
 ('Shoutout','Platform for musicians to find gigs, collaborators and auditions.'),
 ('Book Publishing Engine','Quality-gated workflows behind nine independently published books.'),
]
right_projects=[
 ('Parwah','Family care app for coordinating responsibilities, documents and consent.'),
 ('Find-a-Flatmate','In development: flatmate discovery centred on compatibility, budget and trust.'),
 ('Edu AI','AI-based personalised learning plan covering school years and exam pathways.'),
 ('LoosenUp','Two-minute stress-relief flow with progress feedback and quick help.'),
 ('TH+ LifeEngine','Personalised wellness plans for yoga, food and habit tracking.'),
 ('Hey Yaara','Hinglish conversational AI voice companion.'),
 ('Animind','Explores animal behaviour from brief audio and video clips.'),
 ('Airpane','AR-style web browsing with phone, webcam and screen interactions.'),
 ('ANCHOR','AI-led original techno music creation and publishing workflow.'),
 ('MuseVibe Studio','Music generation from mood and creative direction; being refined.'),
 ('The Passion Table','Home-style dining, delivery and tiffin service concept; being refined.'),
]
assert len(left)+len(right_projects)==23
colgap=12;colw=(CW-colgap)/2
ends=[]
for arr,col in ((left,0),(right_projects,1)):
  x=L+col*(colw+colgap)
  cy=y
  for name,desc in arr:
    cy=para('<font color="#926B25">•</font>  <b>'+html.escape(name)+'</b> — '+html.escape(desc),x,cy,colw,8.2,10.6,after=5)
  ends.append(cy)
y=min(ends)-5
C.setFont('LS',8.0);C.setFillColor(M);C.drawString(L,y,'Live products, demos and supporting case studies:')
C.setFillColor(G);C.setFont('LSB',8);C.drawString(L+236,y,'anchit-tandon.com/#projects')
y-=28
y=section('Education',y)
y=para('<b>B.Tech, Computer Science &amp; Engineering</b>  ·  Vellore Institute of Technology (VIT), Vellore  ·  2016–2020',L,y,CW,9,12,after=2)
y=para('<b>Class XII, Board Examination</b>  ·  95%  ·  2016',L,y,CW,9,12,after=2)
y=para('<b>Class X, CBSE</b>  ·  10 CGPA',L,y,CW,9,12,after=12)
y=section('Recognition',y)
y=para('ET Prime Team Award (2025), Times Internet.',L,y,CW,9,12,after=0)
if y<45: raise RuntimeError(f'Second page overlaps footer: {y}')
footer();C.save()
print(f'Created {OUT}; pages 2, 23 projects; ends p1={y:.1f}')
