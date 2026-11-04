from pathlib import Path
out=Path(__file__).resolve().parents[1]/'public/assets/products'
out.mkdir(parents=True,exist_ok=True)

# Sneaker art is entirely original vector artwork, with interchangeable accent panels.
shoe_svg='''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="780" viewBox="0 0 1200 780" role="img" aria-label="Tênis esportivo estilizado">
<defs>
 <linearGradient id="body" x1="0" y1="0" x2=".95" y2=".95"><stop offset="0" stop-color="#fff"/><stop offset=".43" stop-color="#f7f7f4"/><stop offset=".72" stop-color="#e1e2e2"/><stop offset="1" stop-color="#a6a9ae"/></linearGradient>
 <linearGradient id="red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{light}"/><stop offset=".45" stop-color="{accent}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
 <linearGradient id="sole" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#282a36"/><stop offset=".44" stop-color="#141720"/><stop offset="1" stop-color="#06090f"/></linearGradient>
 <linearGradient id="toe" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".7" stop-color="#e4e6e5"/><stop offset="1" stop-color="#c2c4c4"/></linearGradient>
 <linearGradient id="heel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12161c"/><stop offset="1" stop-color="#000"/></linearGradient>
 <pattern id="weave" width="19" height="19" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M0 0 V19 M9 0 V19" stroke="#140f15" stroke-width="2" opacity=".65"/><path d="M0 10 H19" stroke="#fff" stroke-width="1" opacity=".17"/></pattern>
 <filter id="shadow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="28"/></filter>
 <filter id="depth"><feDropShadow dx="6" dy="14" stdDeviation="12" flood-opacity=".28"/></filter>
</defs>
<ellipse cx="575" cy="660" rx="405" ry="49" fill="#000" opacity=".27" filter="url(#shadow)"/>
<g transform="rotate(-7 610 390)" filter="url(#depth)">
 <!-- outer sculpted rubber / deep black outsole -->
 <path d="M129 521 C132 499 183 477 261 454 C347 429 468 362 548 319 C629 275 693 252 761 214 L878 172 C933 159 962 185 1001 225 L1097 331 C1119 356 1115 386 1095 405 C1011 460 886 513 762 552 C640 591 533 633 402 662 C278 693 179 656 143 605 C129 582 117 551 129 521 Z" fill="url(#sole)" stroke="#4f5460" stroke-width="7"/>
 <path d="M154 561 C260 654 402 644 574 589 C721 542 925 471 1093 383" fill="none" stroke="#484d5b" stroke-width="9" opacity=".75"/>
 <path d="M147 581 C250 685 387 654 580 604 C746 555 914 486 1091 409" fill="none" stroke="#090b11" stroke-width="22" opacity=".85"/>
 <path d="M167 586 C261 652 384 633 555 585" fill="none" stroke="#eef0f0" stroke-width="12" opacity=".85"/>
 <path d="M173 536 C180 485 263 450 371 408 C461 374 519 319 641 276 L761 201 C829 168 905 177 950 205 C1000 239 1037 286 1074 323 C1094 349 1080 385 1062 401 C886 496 636 590 418 619 C300 634 203 606 171 565 C163 556 165 545 173 536Z" fill="url(#body)" stroke="#d8dadb" stroke-width="8"/>
 <!-- heel architecture -->
 <path d="M781 196 C826 162 915 172 951 206 L1062 319 C1030 358 989 385 933 408 L840 289Z" fill="url(#heel)"/>
 <path d="M906 201 C936 211 979 249 1008 285 L1057 331" fill="none" stroke="#82868b" stroke-width="13" opacity=".45"/>
 <path d="M963 253 C1000 283 1039 324 1061 356" fill="none" stroke="{accent}" stroke-width="20"/>
 <path d="M1004 269 L1081 336 L1071 363 L995 298 Z" fill="{accent}" opacity=".78"/>
 <!-- round heel badge -->
 <path d="M913 296 C953 276 986 306 986 348 C986 383 959 419 916 434 C869 449 843 417 847 378 C852 339 876 311 913 296Z" fill="#12151c" stroke="#3d424c" stroke-width="9"/>
 <path d="M904 311 C933 299 958 327 957 351 C954 377 934 404 909 410 C887 418 869 398 873 375 C876 349 886 321 904 311Z" fill="#20232d" stroke="#6b7078" stroke-width="3"/>
 <path d="M911 326 L919 362 L898 372" stroke="#f7f7f7" stroke-width="5" fill="none" stroke-linejoin="round"/>
 <!-- large accent panel -->
 <path d="M314 423 C392 376 510 333 602 284 C674 248 749 238 825 262 C864 273 892 299 915 331 C838 358 791 396 755 445 C698 516 555 560 400 578 C363 573 326 548 305 514Z" fill="url(#red)" stroke="#191b21" stroke-width="13"/>
 <path d="M320 427 C411 388 520 337 607 291 C712 240 823 268 895 330 C810 364 774 401 749 442 C673 522 527 550 400 565 C352 546 331 510 320 427Z" fill="url(#weave)" opacity=".94"/>
 <path d="M367 425 C447 401 514 359 607 317 C710 266 791 283 860 333" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="13"/>
 <path d="M379 461 C494 432 595 372 696 327" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="8"/>
 <!-- toe overlay -->
 <path d="M166 524 C205 475 253 454 336 427 C324 486 355 543 400 575 C328 606 215 587 166 553Z" fill="url(#toe)" stroke="#f3f3f3" stroke-width="6"/>
 <path d="M186 513 C224 481 257 468 314 450" fill="none" stroke="#fff" stroke-width="12" opacity=".9"/>
 <path d="M194 554 C238 568 273 573 306 562" fill="none" stroke="#b4b8b9" stroke-width="5" opacity=".6"/>
 <!-- collar + high-cut tongue -->
 <path d="M624 265 C669 224 688 185 735 135 C759 119 793 113 815 130 C832 142 835 176 837 208 L882 263 C835 266 781 280 738 313 C709 323 661 302 624 265Z" fill="#e9ebeb" stroke="#363840" stroke-width="10"/>
 <path d="M701 207 C715 178 745 131 773 125 C804 119 811 152 808 196 L835 237 C796 238 766 267 741 284Z" fill="#272a33"/>
 <path d="M745 165 C756 149 769 138 781 140" stroke="#72767b" stroke-width="7" fill="none"/>
 <!-- tongue fabric and eyestay -->
 <path d="M592 293 C623 271 661 253 716 250 L767 287 C722 315 658 353 613 368 L571 343Z" fill="#151820" stroke="#333743" stroke-width="10"/>
 <path d="M627 286 C659 275 684 273 714 276" fill="none" stroke="#e0e0df" stroke-width="7"/>
 <path d="M619 306 C658 294 689 294 730 293 M606 329 C642 317 671 311 715 308 M592 345 C625 336 661 329 698 322" fill="none" stroke="#fafafa" stroke-width="9" stroke-linecap="round"/>
 <path d="M618 307 L655 325 M646 300 L675 317 M669 295 L697 311" stroke="#96999c" stroke-width="3"/>
 <!-- geometry at sole arch -->
 <path d="M506 591 C582 571 650 548 713 524 L813 469 L834 506 L750 546 C668 584 588 613 499 625Z" fill="#1f232c" opacity=".9"/>
 <path d="M565 596 C659 563 739 535 809 492" fill="none" stroke="{accent}" stroke-width="6" opacity=".65"/>
 <!-- vent holes -->
 <g fill="#414750" opacity=".48"><circle cx="250" cy="504" r="4"/><circle cx="268" cy="494" r="4"/><circle cx="285" cy="485" r="4"/><circle cx="239" cy="520" r="3"/><circle cx="260" cy="519" r="3"/></g>
 <!-- heel pull -->
 <path d="M777 133 C776 93 793 73 807 70 C829 74 848 111 843 152" fill="none" stroke="#34373c" stroke-width="15"/><path d="M779 136 C781 100 792 87 806 84" fill="none" stroke="#c7c7c8" stroke-width="4"/>
 <path d="M815 143 C830 155 839 169 838 184" fill="none" stroke="#eee" stroke-width="5"/>
 <!-- glossy edge highlights -->
 <path d="M170 537 C220 479 376 418 480 359" fill="none" stroke="#fff" stroke-width="7" opacity=".72"/>
 <path d="M825 215 C903 213 953 253 988 294" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="8"/>
 </g>
</svg>'''

def shade(hex, mul):
    h=hex.lstrip('#')
    vals=[int(h[i:i+2],16) for i in (0,2,4)]
    vals=[max(0,min(255,int(v*mul))) for v in vals]
    return '#'+''.join(f'{v:02x}' for v in vals)

for name, accent in {'arc-red':'#ed2e36','arc-green':'#8dfb4a','arc-violet':'#9b45e4','arc-blue':'#57b7ff'}.items():
    (out/f'{name}.svg').write_text(shoe_svg.format(accent=accent,light=shade(accent,1.3),dark=shade(accent,.6)),encoding='utf8')

common='''<defs>
<linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{light}"/><stop offset=".36" stop-color="{color}"/><stop offset=".74" stop-color="{color}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
<linearGradient id="sleeve" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></linearGradient>
<filter id="shade"><feDropShadow dx="8" dy="16" stdDeviation="12" flood-opacity=".16"/></filter>
<pattern id="texture" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 1L9 2 M0 7L9 6" stroke="#fff" stroke-opacity=".035" stroke-width="1"/></pattern>
</defs>'''

def wrap(body, color, w=700,h=800):
    defs=common.format(color=color,light=shade(color,1.2),dark=shade(color,.78))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{defs}{body}</svg>'

tee='''<g filter="url(#shade)">
<path d="M257 151 C270 132 307 121 320 118 L379 118 C409 121 447 135 459 151 L563 189 Q581 201 587 225 L610 314 Q612 327 596 333 L515 361 L500 315 L500 643 Q500 665 481 675 Q351 703 216 675 Q200 667 200 647 L200 315 L185 361 L104 333 Q89 327 94 314 L117 225 Q123 201 142 189Z" fill="url(#cloth)" stroke="{dark}" stroke-width="2"/>
<path d="M257 150 C289 192 304 207 350 208 C395 207 423 183 459 150 L435 148 C404 186 377 194 351 194 C322 194 297 183 278 149Z" fill="{dark}" opacity=".52"/>
<path d="M283 136 C306 156 320 166 351 167 C382 168 397 156 421 136" fill="none" stroke="{dark}" stroke-opacity=".67" stroke-width="17"/>
<path d="M287 133 C306 157 325 167 350 168 C379 168 395 154 413 136" fill="none" stroke="{light}" stroke-width="8"/>
<path d="M199 310 L213 269 L219 654 M499 311 L484 270 L480 651" stroke="{dark}" stroke-opacity=".22" fill="none" stroke-width="9"/>
<path d="M104 325 L187 350 M514 350 L598 325 M214 655 Q354 678 485 655" stroke="{light}" stroke-opacity=".45" fill="none" stroke-width="7"/>
<path d="M335 220 Q320 420 327 646" fill="none" stroke="#fff" stroke-opacity=".04" stroke-width="28"/>
<path d="M201 313 L500 313 L500 646 Q350 684 200 646Z" fill="url(#texture)"/>
<text x="349" y="360" font-family="Arial,sans-serif" font-size="22" font-weight="900" letter-spacing="2" text-anchor="middle" fill="{printcolor}" opacity=".85">AVANT.</text>
</g>'''

for name,color,printcolor in [('tee-cream','#e1dacc','#393c3c'),('tee-black','#252729','#e5e3d9'),('tee-blue','#647790','#ece8df')]:
    (out/f'{name}.svg').write_text(wrap(tee.format(color=color,light=shade(color,1.2),dark=shade(color,.75),printcolor=printcolor),color),encoding='utf8')

jacket='''<g filter="url(#shade)">
<path d="M252 143 Q301 116 333 117 L369 117 Q411 117 448 145 L530 181 Q564 194 577 241 L620 405 Q619 429 601 435 L520 445 L498 375 L492 663 Q350 701 207 663 L200 375 L178 445 L97 435 Q80 429 81 405 L124 241 Q135 194 170 181Z" fill="url(#cloth)" stroke="{dark}" stroke-width="5"/>
<path d="M332 120 Q351 154 366 119 L402 126 L383 205 L365 235 L351 218 L331 235 L312 206 L290 129Z" fill="{dark}" opacity=".45"/>
<path d="M289 133 Q319 191 347 235 L350 665" fill="none" stroke="{dark}" stroke-width="17"/>
<path d="M409 134 Q379 190 355 235 L351 666" fill="none" stroke="{light}" stroke-width="15"/>
<path d="M343 242 L343 669" stroke="#0c0d0e" stroke-width="8"/>
<path d="M357 245 L357 665" stroke="#f6f6f4" stroke-opacity=".65" stroke-width="3"/>
<path d="M213 347 L200 602 M486 347 L501 602" stroke="{dark}" stroke-opacity=".5" stroke-width="9"/>
<path d="M226 440 L300 440 L298 523 L222 523Z M399 440 L474 440 L477 523 L402 523Z" fill="{dark}" opacity=".22"/>
<path d="M224 446 H300 M399 446 H475" stroke="{light}" stroke-width="7" opacity=".8"/>
<path d="M99 406 L176 417 M520 417 L601 406 M204 643 Q349 675 496 643" stroke="{dark}" stroke-width="12"/>
<path d="M257 179 L304 225 M442 179 L393 225" stroke="{light}" stroke-width="10" opacity=".65"/>
<text x="439" y="309" font-family="Arial" font-size="17" font-weight="900" letter-spacing="2" fill="{printcolor}" text-anchor="middle">A.</text>
<path d="M211 376 L491 376 L492 654 Q350 681 207 653Z" fill="url(#texture)"/>
</g>'''
for name,color,pc in [('jacket-graphite','#3b3b40','#d5d5d5'),('jacket-sand','#bcae98','#2d2b29')]:
    (out/f'{name}.svg').write_text(wrap(jacket.format(color=color,light=shade(color,1.23),dark=shade(color,.66),printcolor=pc),color),encoding='utf8')

hoodie='''<g filter="url(#shade)">
<path d="M279 158 Q258 105 305 77 Q345 55 388 77 Q432 105 416 160 L456 176 L527 213 Q550 225 567 260 L615 408 Q622 431 604 439 L526 455 L505 398 L503 653 Q350 703 197 653 L195 398 L174 455 L96 439 Q79 431 86 408 L133 260 Q149 225 172 213 L245 176Z" fill="url(#cloth)" stroke="{dark}" stroke-width="5"/>
<path d="M281 164 Q278 102 312 88 Q346 69 384 90 Q422 111 414 163 L392 223 Q348 248 309 223Z" fill="{dark}" opacity=".57"/>
<path d="M301 162 Q313 114 344 112 Q379 108 394 160 L386 197 Q346 218 312 195Z" fill="{dark}" opacity=".8"/>
<path d="M314 217 Q349 254 388 217" fill="none" stroke="{light}" stroke-width="20"/>
<path d="M320 225 L322 305 M375 225 L370 304" fill="none" stroke="#e4e4e4" stroke-width="4" opacity=".8"/>
<circle cx="322" cy="306" r="5" fill="{dark}"/><circle cx="370" cy="305" r="5" fill="{dark}"/>
<path d="M247 450 Q348 427 453 450 L466 570 Q351 596 234 570Z" fill="{dark}" opacity=".15" stroke="{dark}" stroke-width="4"/>
<path d="M239 469 Q349 448 462 469" fill="none" stroke="{light}" stroke-width="7" opacity=".45"/>
<path d="M205 624 Q350 664 496 624 M95 422 L173 434 M528 434 L607 422" fill="none" stroke="{dark}" stroke-width="16"/>
<text x="349" y="375" font-family="Arial" font-size="22" font-weight="900" letter-spacing="2" text-anchor="middle" fill="{printcolor}" opacity=".9">AVANT.</text>
</g>'''
for name,color,pc in [('hoodie-grey','#afb1ae','#353639'),('hoodie-black','#2a2b2f','#d4d5d6')]:
    (out/f'{name}.svg').write_text(wrap(hoodie.format(color=color,light=shade(color,1.2),dark=shade(color,.71),printcolor=pc),color),encoding='utf8')

pants='''<g filter="url(#shade)">
<path d="M233 119 Q349 105 469 119 L492 285 L462 662 Q452 704 432 708 L372 706 L349 345 L327 706 L256 708 Q234 703 231 670 L206 293Z" fill="url(#cloth)" stroke="{dark}" stroke-width="5"/>
<path d="M232 119 L469 119 L478 170 Q350 191 223 170Z" fill="{dark}" opacity=".27"/>
<path d="M231 157 Q354 181 477 157" stroke="{light}" stroke-opacity=".6" stroke-width="6" fill="none"/>
<path d="M351 160 L351 342 M248 178 L288 257 M451 176 L411 257" stroke="{dark}" opacity=".35" stroke-width="6" fill="none"/>
<path d="M224 270 L307 287 L302 416 L216 400Z M389 287 L477 268 L484 401 L398 416Z" fill="{dark}" opacity=".2" stroke="{dark}" stroke-width="5"/>
<path d="M224 286 L306 302 M390 302 L477 284" stroke="{light}" stroke-width="10" opacity=".65"/>
<path d="M249 420 L304 426 M396 426 L457 421 M246 658 L331 656 M367 655 L456 658" stroke="{dark}" stroke-width="12" opacity=".55"/>
<path d="M231 272 L255 615 M468 272 L441 615" fill="none" stroke="{light}" stroke-width="9" opacity=".22"/>
</g>'''
for name,color in [('cargo-dark','#2a2b2c'),('cargo-olive','#787a5b')]:
    (out/f'{name}.svg').write_text(wrap(pants.format(color=color,light=shade(color,1.25),dark=shade(color,.65)),color),encoding='utf8')

cap='''<g filter="url(#shade)">
<path d="M170 418 Q167 281 268 218 Q340 173 441 213 Q544 256 553 423 L552 454 Q359 503 169 456Z" fill="url(#cloth)" stroke="{dark}" stroke-width="8"/>
<path d="M344 193 Q378 278 362 473" fill="none" stroke="{dark}" stroke-width="6" opacity=".3"/>
<path d="M271 225 Q247 340 290 466 M444 214 Q478 341 432 460" fill="none" stroke="{light}" stroke-width="6" opacity=".23"/>
<path d="M175 447 Q322 405 555 455 Q642 475 665 499 Q678 525 642 545 Q512 611 356 572 Q241 547 142 506 Q118 496 137 474Z" fill="url(#cloth)" stroke="{dark}" stroke-width="8"/>
<path d="M143 494 Q373 542 654 516" fill="none" stroke="{light}" stroke-width="8" opacity=".36"/>
<path d="M178 458 Q348 497 551 470" fill="none" stroke="{dark}" stroke-width="7"/>
<text x="355" y="382" font-family="Arial" font-size="44" letter-spacing="-5" font-weight="900" text-anchor="middle" fill="{printcolor}">AVANT.</text>
<ellipse cx="351" cy="194" rx="14" ry="8" fill="{dark}"/>
</g>'''
for name,color,pc in [('cap-black','#303033','#f4f4f0'),('cap-red','#ba3037','#fff')]:
    (out/f'{name}.svg').write_text(wrap(cap.format(color=color,light=shade(color,1.3),dark=shade(color,.65),printcolor=pc),color),encoding='utf8')

print('Generated',len(list(out.glob('*.svg'))),'SVG product images')
