"""Builds WristGuard_Research.pdf with ReportLab."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, Image, KeepTogether, PageBreak)
from reportlab.graphics.shapes import Drawing, Line, Circle, String, Rect, Wedge, PolyLine
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import math, sys

FONT_DIR = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('Sans', FONT_DIR + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold', FONT_DIR + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Sans-It', FONT_DIR + 'DejaVuSans-Oblique.ttf'))
pdfmetrics.registerFont(TTFont('Serif', FONT_DIR + 'DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('Serif-Bold', FONT_DIR + 'DejaVuSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif-It', FONT_DIR + 'DejaVuSerif-Italic.ttf'))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('Serif', normal='Serif', bold='Serif-Bold', italic='Serif-It', boldItalic='Serif-Bold')
registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans-It', boldItalic='Sans-Bold')

TEAL = colors.HexColor('#0f766e')
TEAL_SOFT = colors.HexColor('#e3f2ee')
INK = colors.HexColor('#17201c')
INK2 = colors.HexColor('#4b5a53')
RULE = colors.HexColor('#d5ddd8')
OK = colors.HexColor('#15803d'); WARN = colors.HexColor('#b45309'); RISK = colors.HexColor('#b91c1c')

S = {
    'title': ParagraphStyle('title', fontName='Sans-Bold', fontSize=21, leading=26, textColor=INK, spaceAfter=6),
    'subtitle': ParagraphStyle('subtitle', fontName='Sans', fontSize=11.5, leading=16, textColor=INK2, spaceAfter=4),
    'meta': ParagraphStyle('meta', fontName='Sans', fontSize=9, leading=13, textColor=INK2),
    'h1': ParagraphStyle('h1', fontName='Sans-Bold', fontSize=13.5, leading=18, textColor=TEAL, spaceBefore=14, spaceAfter=6),
    'h2': ParagraphStyle('h2', fontName='Sans-Bold', fontSize=10.5, leading=14, textColor=INK, spaceBefore=8, spaceAfter=3),
    'body': ParagraphStyle('body', fontName='Serif', fontSize=9.8, leading=14.6, textColor=INK, spaceAfter=7),
    'abstract': ParagraphStyle('abstract', fontName='Serif', fontSize=9.6, leading=14.2, textColor=INK),
    'caption': ParagraphStyle('caption', fontName='Sans', fontSize=8.2, leading=11.5, textColor=INK2, spaceBefore=4, spaceAfter=10),
    'cell': ParagraphStyle('cell', fontName='Sans', fontSize=8.3, leading=11, textColor=INK),
    'cellb': ParagraphStyle('cellb', fontName='Sans-Bold', fontSize=8.3, leading=11, textColor=INK),
    'ref': ParagraphStyle('ref', fontName='Serif', fontSize=8.6, leading=12, textColor=INK, leftIndent=16, firstLineIndent=-16, spaceAfter=4),
    'bullet': ParagraphStyle('bullet', fontName='Serif', fontSize=9.8, leading=14.6, textColor=INK, leftIndent=14, bulletIndent=2, spaceAfter=3),
}
P = lambda t, s='body': Paragraph(t, S[s])


def table(rows, widths, header=True, zebra=True):
    data = [[Paragraph(str(c), S['cellb'] if (header and i == 0) else S['cell']) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [('VALIGN', (0, 0), (-1, -1), 'TOP'),
             ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
             ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
             ('LINEBELOW', (0, 0), (-1, -1), 0.4, RULE)]
    if header:
        style += [('BACKGROUND', (0, 0), (-1, 0), TEAL_SOFT), ('LINEBELOW', (0, 0), (-1, 0), 0.8, TEAL)]
    t.setStyle(TableStyle(style))
    return t


def angle_diagram():
    """Forearm and hand axes with the measured angle."""
    d = Drawing(460, 150)
    ex, ey = 40, 55
    wx, wy = 250, 70
    th = math.radians(28)
    fdir = math.atan2(wy - ey, wx - ex)
    hx, hy = wx + 120 * math.cos(fdir + th), wy + 120 * math.sin(fdir + th)
    # dashed forearm continuation
    cx, cy = wx + 120 * math.cos(fdir), wy + 120 * math.sin(fdir)
    d.add(Line(wx, wy, cx, cy, strokeColor=RULE, strokeWidth=1.2, strokeDashArray=[4, 3]))
    d.add(Line(ex, ey, wx, wy, strokeColor=INK2, strokeWidth=5, strokeLineCap=1))
    d.add(Line(wx, wy, hx, hy, strokeColor=WARN, strokeWidth=6, strokeLineCap=1))
    d.add(Wedge(wx, wy, 42, math.degrees(fdir), math.degrees(fdir + th), fillColor=colors.Color(0.7, 0.33, 0.04, 0.18), strokeColor=WARN, strokeWidth=0.8))
    for (x, y, c, r) in [(ex, ey, INK2, 6), (wx, wy, WARN, 6.5), (hx, hy, WARN, 4.5)]:
        d.add(Circle(x, y, r, fillColor=c, strokeColor=colors.white, strokeWidth=1.2))
    d.add(String(ex - 8, ey - 20, 'Elbow (pose 13/14)', fontName='Sans', fontSize=8, fillColor=INK2))
    d.add(String(wx - 30, wy - 22, 'Wrist (hand 0)', fontName='Sans', fontSize=8, fillColor=INK2))
    d.add(String(hx - 20, hy + 10, 'Middle knuckle (hand 9)', fontName='Sans', fontSize=8, fillColor=INK2))
    d.add(String(wx + 48, wy + 10, 'θ', fontName='Sans-Bold', fontSize=12, fillColor=WARN))
    d.add(String(100, 90, 'forearm axis f', fontName='Sans-It', fontSize=8.5, fillColor=INK2))
    d.add(String(cx - 60, cy - 14, 'straight wrist', fontName='Sans-It', fontSize=8, fillColor=colors.HexColor('#98a39d')))
    return d


def threshold_chart():
    """Horizontal bars: caution and risk angles by direction."""
    rows = [('Ulnar (toward pinky)', 12.1, 14.5), ('Radial (toward thumb)', 17.8, 21.8),
            ('Extension (up)', 26.6, 32.7), ('Flexion (down)', 37.7, 48.6)]
    W, H = 460, 150
    d = Drawing(W, H)
    x0, scale, top, rowh = 135, 5.4, H - 22, 28
    for v in range(0, 61, 10):
        x = x0 + v * scale
        d.add(Line(x, 12, x, top + 8, strokeColor=RULE, strokeWidth=0.4))
        d.add(String(x - 5, 2, f'{v}°', fontName='Sans', fontSize=7, fillColor=INK2))
    for i, (name, c, r) in enumerate(rows):
        y = top - i * rowh - 6
        d.add(String(4, y + 3, name, fontName='Sans', fontSize=8.2, fillColor=INK))
        d.add(Rect(x0, y, c * scale, 12, fillColor=colors.Color(0.08, 0.5, 0.24, 0.55), strokeColor=None))
        d.add(Rect(x0 + c * scale, y, (r - c) * scale, 12, fillColor=colors.Color(0.7, 0.33, 0.04, 0.6), strokeColor=None))
        d.add(Rect(x0 + r * scale, y, (60 - r) * scale, 12, fillColor=colors.Color(0.73, 0.11, 0.11, 0.25), strokeColor=None))
        d.add(String(x0 + r * scale + 4, y + 3, f'{c}° / {r}°', fontName='Sans-Bold', fontSize=7.5, fillColor=INK))
    return d


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('Sans', 7.5)
    canvas.setFillColor(INK2)
    if doc.page > 1:
        canvas.drawString(0.85 * inch, 0.55 * inch, 'WristGuard: evidence and design')
    canvas.drawRightString(letter[0] - 0.85 * inch, 0.55 * inch, f'{doc.page}')
    canvas.setStrokeColor(TEAL)
    canvas.setLineWidth(2.2)
    if doc.page == 1:
        canvas.line(0.85 * inch, letter[1] - 0.6 * inch, 1.6 * inch, letter[1] - 0.6 * inch)
    canvas.restoreState()


def build(out, figdir):
    doc = BaseDocTemplate(out, pagesize=letter, leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                          topMargin=0.8 * inch, bottomMargin=0.85 * inch,
                          title='WristGuard: Evidence and Design', author='Danayt Woldearegay',
                          subject='Research basis for a wrist strain prevention tool')
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
    doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=on_page)])
    W = doc.width
    st = []

    st += [P('WristGuard: An Evidence-Based Tool for Preventing Wrist Strain in Computer Work', 'title'),
           P('Research basis, design decisions, and validation of a browser extension and webcam posture checker', 'subtitle'),
           P('Danayt Woldearegay &nbsp;·&nbsp; Augsburg University, Minneapolis &nbsp;·&nbsp; September 2026', 'meta'),
           Spacer(1, 14)]

    abstract = (
        '<b>Abstract.</b> People who type for hours face a real but modest risk of wrist and hand disorders, including '
        'carpal tunnel syndrome. This paper reviews the evidence on four levers a software tool can pull: wrist posture, '
        'exposure time, rest breaks, and gliding exercises, plus one lever it should avoid: bracing during work. The '
        'strongest quantitative evidence concerns posture. Laboratory measurements of carpal tunnel pressure give angle '
        'limits for each direction of wrist bend, with ulnar deviation the most restrictive at about 15°. Evidence for '
        'breaks is mixed: two field and lab studies found less discomfort with no productivity loss, while the 2025 '
        'Cochrane review rates the preventive evidence as low certainty. Based on this, WristGuard pairs low-cost break '
        'reminders that count active typing time with a webcam posture checker scored against published pressure '
        'thresholds. On synthetic images with known bends of 20° to 40°, the checker measured angles within 5° after '
        'calibration and assigned every case to the correct zone. The tool is a coach, not a diagnostic device.')
    st.append(Table([[P(abstract, 'abstract')]], colWidths=[W],
                    style=[('BACKGROUND', (0, 0), (-1, -1), TEAL_SOFT), ('LEFTPADDING', (0, 0), (-1, -1), 12),
                           ('RIGHTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 10),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))

    # 1
    st += [P('1. The problem', 'h1'),
           P('The median nerve passes through the carpal tunnel at the wrist alongside nine finger flexor tendons. When '
             'pressure in the tunnel stays elevated, the nerve can become irritated, producing the tingling, numbness and '
             'weakness of carpal tunnel syndrome. Keyboard and mouse work combines three factors that can raise that '
             'pressure or load the tendons: bent wrist postures, sustained static holding, and many hours of exposure.'),
           P('Most break-reminder tools treat the problem as purely about time. This project started from a different '
             'question: which factors does the evidence actually support, and how strongly? The answer shaped a tool '
             'with two parts. A browser extension handles exposure with reminders and guided exercises. A webcam checker '
             'handles posture, the factor with the most precise evidence and the one timers cannot see.')]

    # 2
    st += [P('2. Method', 'h1'),
           P('This was a targeted review, not a formal systematic review. Priority went to primary laboratory studies, '
             'meta-analyses, Cochrane reviews, clinical practice guidelines and government ergonomics guidance. Where a '
             'paper could not be read directly, figures were taken only from the publisher abstract or an official full '
             'text copy (for example, NIOSH hosts full texts of several studies). Each finding was then mapped to a '
             'concrete feature or default in the software, and features without evidence were dropped or flagged.')]

    # 3
    st += [P('3. What the evidence says', 'h1'),
           P('3.1 Wrist posture has measurable pressure thresholds', 'h2'),
           P('Keir, Bach, Hudes and Rempel (2007) measured carpal tunnel pressure across wrist postures and reported the '
             'angle at which pressure crosses 25 and 30 mmHg for the 25th percentile of participants. Staying inside '
             'these angles keeps about 75% of people below that pressure. The limits are asymmetric: the wrist tolerates '
             'far more flexion than ulnar deviation.')]
    st.append(KeepTogether([threshold_chart(),
        P('<b>Figure 1.</b> Wrist angles at which 75% of people stay below 25 mmHg (green ends) and 30 mmHg (amber ends) '
          'of carpal tunnel pressure. Data: Keir et al. (2007), <i>Human Factors</i> 49(1):88-99.', 'caption')]))
    st += [P('Normal typing sits close to these limits. Marklin, Simoneau and Monroe (1999) measured 15° to 23° of '
             'extension and 10° to 16° of ulnar deviation on conventional keyboards, with the forearm rotated 62° to 68° '
             'palm-down. Split keyboards brought ulnar deviation to within 5° of neutral but barely changed extension. In '
             'other words, an ordinary setup can put a typist in the caution zone for ulnar deviation all day without '
             'any pain signal to warn them.'),
           P('3.2 Exposure: a real but modest risk factor', 'h2'),
           P('Shiri and Falah-Hassani (2015) pooled studies of computer use and carpal tunnel syndrome. Among office '
             'workers, computer use carried higher odds (OR 1.34, 95% CI 1.08 to 1.65), mouse use more so (OR 1.93, 95% '
             'CI 1.43 to 2.61). Compared with the general population the association reversed, which the authors attribute '
             'to other occupations carrying heavier hand loads. Their conclusion: excessive computer use, especially mouse '
             'use, may be a minor occupational risk factor. In a Danish one-year follow-up study, Andersen et al. (2003) '
             'found mouse use above roughly 20 hours a week predicted new tingling and numbness, while keyboard use did '
             'not. The honest reading is that computer work raises risk somewhat and dose matters.'),
           P('3.3 Breaks: positive field results, low-certainty reviews', 'h2'),
           P('Galinsky et al. (2000) ran a NIOSH field study with 42 data-entry operators. Adding four 5-minute breaks per '
             'shift to the usual two 15-minute breaks significantly reduced forearm, wrist and hand discomfort, neck and '
             'back discomfort, and eyestrain. Keystroke rate did not fall (8,591 vs 7,931 per hour, not significant) and '
             'accuracy held at 97%. McLean et al. (2001) found microbreaks every 20 minutes reduced discomfort in the '
             'wrist, neck, shoulder and lower back with no detectable productivity cost, in a small sample of 15 workers.'),
           P('The systematic evidence is weaker. The 2025 Cochrane review (Luger et al.) pooled 9 randomized trials with '
             '626 mostly office workers and found low-quality evidence that additional breaks may not have a considerable '
             'effect on musculoskeletal symptoms, with no trials comparing break durations. Breaks are therefore justified '
             'as cheap, low-risk and comfort-improving, not as proven prevention. The design has to keep their cost to the '
             'user close to zero.'),
           P('3.4 Gliding exercises: modest support', 'h2'),
           P('Kim (2015) reviewed 4 randomized trials and found that tendon and nerve gliding exercises combined with '
             'conventional treatment improved symptom severity and function in carpal tunnel syndrome more than '
             'conventional treatment alone. The evidence base is small and concerns people with symptoms, so the tool '
             'presents exercises as a low-risk habit rather than a treatment. The 2024 AAOS/ASSH guideline also reports '
             'moderate evidence that general physical activity is associated with lower carpal tunnel risk.'),
           P('3.5 Braces and wrist rests during work', 'h2'),
           P('The AAOS/ASSH guideline rates immobilization with a brace as strongly supported for improving patient-reported '
             'outcomes in carpal tunnel syndrome, and braces are commonly prescribed for night wear. During active work the '
             'trade-offs change. In a laboratory task, Shu and Mirka (2006) found wrist splints cut wrist flexion by 48% and '
             'ulnar deviation by 80%, but increased shoulder abduction by 22% and torso lateral bend by 30%, and forearm flexor '
             'activity rose when participants bent against the splint. The authors cautioned that splints at work may do more '
             'harm than good. OSHA similarly advises that a palm rest should support the heel of the hand, not the wrist, and '
             'be used between bursts of typing rather than during keystrokes.')]

    # 4
    st += [P('4. From evidence to design', 'h1'),
           P('Table 1 maps each finding to what WristGuard does. The rule was simple: every default traces to a source, and '
             'where the evidence is weak the feature is framed that way in the interface.')]
    st.append(table([
        ['Evidence', 'Design decision', 'Default'],
        ['Pressure thresholds by direction (Keir 2007)', 'Posture checker zones: OK, caution, high', 'Ext 27/33°, flex 38/49°, ulnar 12/15°, radial 18/22°'],
        ['Typing sits near limits (Marklin 1999)', 'Measure posture directly instead of guessing from time', 'Side and top camera views'],
        ['Dose matters (Shiri 2015, Andersen 2003)', 'Timers count active input time, not clock time', '1-minute tick, idle excluded'],
        ['20-min microbreaks helped (McLean 2001)', 'Stage A microbreak', 'Every 20 active min, 30 s'],
        ['5-min supplementary breaks helped (Galinsky 2000)', 'Stage B guided exercise routine', 'Every 60 active min, about 4 min'],
        ['Breaks are low-certainty (Cochrane 2025)', 'Minimize friction: snooze, idle credit, pause', 'Snooze 5 min; 5 idle min = full break'],
        ['Gliding exercises help modestly (Kim 2015)', 'Tendon glides in default routine; nerve glide optional', 'Caution label on nerve glide'],
        ['Splints at work shift load (Shu 2006)', 'Coach posture instead of immobilizing', 'OSHA palm-rest guidance in app'],
    ], [W * 0.34, W * 0.36, W * 0.30]))
    st.append(P('<b>Table 1.</b> Evidence-to-feature mapping.', 'caption'))

    # 5
    st += [P('5. System design', 'h1'),
           P('5.1 Break reminder engine', 'h2'),
           P('The extension is built on Chrome Manifest V3 and runs in Chrome, Edge and other Chromium browsers. A service '
             'worker receives a one-minute alarm and adds the elapsed time to two counters only when the browser reports '
             'the user as active. Any single gap is capped at 90 seconds, so a sleeping laptop does not count as typing time. Reminders use two '
             'stages. First, a notification offers Start and Snooze. If it is ignored for three active minutes, a focused '
             'break window opens. Closing that window counts as a skip. Idle periods count as rest: any detected idle '
             'period resets the microbreak timer, and five minutes away resets both timers and is logged as a natural rest. '
             'All state is serialized through a single queue so alarms, idle events and messages cannot race.'),
           P('5.2 Webcam posture checker', 'h2'),
           P('The checker runs MediaPipe Holistic entirely in the browser. The model, WebAssembly runtime and weights are '
             'bundled with the extension, so no video or data leaves the device and no network request is made. For each '
             'frame it pairs every detected hand with the nearer pose elbow, then computes two axes: the forearm, from '
             'elbow to wrist, and the hand, from wrist to the middle-finger knuckle. The knuckle is used instead of a '
             'fingertip so that finger curl does not change the reading.')]
    st.append(KeepTogether([angle_diagram(),
        P('<b>Figure 2.</b> Wrist angle θ is the angle between the forearm axis and the hand axis. A side camera measures '
          'extension and flexion; a top camera measures ulnar and radial deviation.', 'caption')]))
    st += [P('The unsigned angle is atan2(|f × h|, f · h). Its sign comes from the part of the hand axis perpendicular to '
             'the forearm. In side view it is compared with the image up direction, which is the back of the hand when '
             'typing palm-down, so positive means extension. In top view it is compared with the vector from index to '
             'pinky knuckle, so positive means ulnar deviation for either hand. Coordinates are scaled by the frame aspect '
             'ratio before any math. A calibration step records the median angle while the user holds a straight wrist and '
             'subtracts it, which removes camera tilt and individual anatomy. Readings are smoothed with an exponential '
             'moving average, scored against the thresholds in Figure 1, and an alert fires after five continuous seconds '
             'in the high zone. Processing is capped at about 15 frames per second to keep CPU use low while typing.')]

    # 6
    st += [P('6. Validation', 'h1'),
           P('Three layers of testing were run in a headless Chromium browser with the extension loaded.'),
           Paragraph('<b>Angle math.</b> Unit tests on synthetic landmarks covered extension, flexion, ulnar and radial '
                     'bends, both hands, both arm directions and non-square frames. All 8 cases returned the exact expected '
                     'angle and sign.', S['bullet'], bulletText='•'),
           Paragraph('<b>Reminder engine.</b> Forced alarm ticks confirmed the full state machine: microbreak firing at the '
                     'threshold, escalation to a break window after three ignored minutes, skip on window close with timer '
                     'reset, exercise breaks taking priority, snooze suppressing reminders, and pause.', S['bullet'], bulletText='•'),
           Paragraph('<b>End-to-end detection.</b> A photo of a person with straight, outstretched arms was fed through a '
                     'virtual webcam. The checker found both elbows and hands and read 1.1° and 1.6°. Hands were then '
                     'rotated about the wrist by known angles to create bent-wrist images.', S['bullet'], bulletText='•'),
           Spacer(1, 4)]
    st.append(table([
        ['Case', 'True bend', 'Measured (calibrated)', 'Error', 'Zone'],
        ['A, right wrist', '40° extension', '35.0° extension', '−5.0°', 'High (correct)'],
        ['A, left wrist', '25° flexion', '22.1° flexion', '−2.9°', 'OK (correct)'],
        ['B, right wrist', '20° extension', '18.0° extension', '−2.0°', 'OK (correct)'],
        ['B, left wrist', '30° extension', '30.5° extension', '+0.5°', 'Caution (correct)'],
    ], [W * 0.17, W * 0.18, W * 0.25, W * 0.14, W * 0.26]))
    st.append(P('<b>Table 2.</b> Synthetic bend test. Calibrated values subtract the straight-arm baseline. Mean absolute '
                'error 2.6°, maximum 5.0°, all four zones correct.', 'caption'))
    st.append(KeepTogether([Image(f'{figdir}/fig_live.png', width=W * 0.78, height=W * 0.78 * 469 / 834),
        P('<b>Figure 3.</b> Checker running on test case A (display is mirrored like a selfie). The high-zone alert has '
          'fired for the wrist bent 40° up.', 'caption')]))

    # 7
    st += [P('7. Limitations', 'h1'),
           Paragraph('A single camera sees a 2D projection, so each view measures one plane. Accuracy drops when the forearm '
                     'points toward the lens.', S['bullet'], bulletText='•'),
           Paragraph('Validation used synthetic rotations of one image, not real typists against a goniometer or motion '
                     'capture. Independent work has validated MediaPipe hand tracking against optical motion capture '
                     '(Amprimo et al., 2024) but found error rises with distance, speed and occlusion.', S['bullet'], bulletText='•'),
           Paragraph('The thresholds come from pressure in the tunnel, measured largely in static postures. They are '
                     'reasonable targets, not proof that crossing them causes injury.', S['bullet'], bulletText='•'),
           Paragraph('Typing force, the second risk factor identified early in this project, is not measured.', S['bullet'], bulletText='•'),
           Paragraph('Break effects are low certainty. The tool cannot promise prevention, and is not medical advice.', S['bullet'], bulletText='•')]

    # 8
    st += [P('8. Next steps', 'h1'),
           P('The most useful next study is a small pilot: 10 to 20 students who type daily, comparing checker readings '
             'with a goniometer, and tracking break follow-through and self-reported discomfort over two weeks. A desk-mounted '
             'force-sensitive resistor pad would add typing force without the adoption cost of a wearable. Finally, a '
             'passive mode that samples posture for a few seconds every few minutes would give all-day posture data without '
             'keeping the camera on continuously.'),
           P('9. Conclusion', 'h1'),
           P('The evidence supports three honest claims. Wrist angle has measurable pressure limits and ordinary keyboards '
             'sit near them. Computer and especially mouse exposure is a modest risk factor. Breaks and gliding exercises '
             'are cheap and may help, with low to moderate certainty. WristGuard is built around those claims: it '
             'measures the factor with the strongest evidence, keeps the weaker interventions low-friction, and says '
             'plainly what it cannot do.')]

    # refs
    st += [P('References', 'h1')]
    refs = [
        'AAOS/ASSH. Management of Carpal Tunnel Syndrome: Evidence-Based Clinical Practice Guideline. American Academy of Orthopaedic Surgeons; 2024.',
        'Amprimo G, Masi G, Pettiti G, Olmo G, Priano L, Ferraris C. Hand tracking for clinical applications: validation of the Google MediaPipe Hand (GMH) and the depth-enhanced GMH-D frameworks. <i>Biomedical Signal Processing and Control</i>. 2024;96:106508.',
        'Andersen JH, Thomsen JF, Overgaard E, et al. Computer use and carpal tunnel syndrome: a 1-year follow-up study. <i>JAMA</i>. 2003;289(22):2963-2969.',
        'Galinsky TL, Swanson NG, Sauter SL, Hurrell JJ, Schleifer LM. A field study of supplementary rest breaks for data-entry operators. <i>Ergonomics</i>. 2000;43(5):622-638.',
        'Keir PJ, Bach JM, Hudes M, Rempel DM. Guidelines for wrist posture based on carpal tunnel pressure thresholds. <i>Human Factors</i>. 2007;49(1):88-99.',
        'Kim SD. Efficacy of tendon and nerve gliding exercises for carpal tunnel syndrome: a systematic review of randomized controlled trials. <i>Journal of Physical Therapy Science</i>. 2015;27(8):2645-2648.',
        'Luger T, Ferenchak SA, Rieger MA, Steinhilber B. Work-break interventions for preventing musculoskeletal symptoms and disorders in healthy workers. <i>Cochrane Database of Systematic Reviews</i>. 2025. CD012886.pub3.',
        'Marklin RW, Simoneau GG, Monroe JF. Wrist and forearm posture from typing on split and vertically inclined computer keyboards. <i>Human Factors</i>. 1999;41(4). doi:10.1518/001872099779656770.',
        'McLean L, Tingley M, Scott RN, Rickards J. Computer terminal work and the benefit of microbreaks. <i>Applied Ergonomics</i>. 2001;32(3):225-237.',
        'Occupational Safety and Health Administration. Computer Workstations eTool: Wrist/Palm Supports. osha.gov.',
        'Shiri R, Falah-Hassani K. Computer use and carpal tunnel syndrome: a meta-analysis. <i>Journal of the Neurological Sciences</i>. 2015;349:15-19.',
        'Shu Y, Mirka GA. A laboratory study of the effects of wrist splint orthoses on forearm muscle activity and upper extremity posture. <i>Human Factors</i>. 2006;48(3):499-510.',
    ]
    for i, r in enumerate(refs, 1):
        st.append(Paragraph(f'{i}. {r}', S['ref']))
    doc.build(st)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
