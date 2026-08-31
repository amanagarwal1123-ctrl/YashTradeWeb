{
  "brand_attributes": {
    "public": ["premium", "trustworthy", "warm", "mobile-first", "clear-step guidance", "jewellery-craft feel"],
    "admin": ["efficient", "data-dense", "auditable", "low-friction", "desktop-first"],
    "relationship_rule": "Public and Admin share the same core brand tokens (navy/red) but diverge in surface treatment: Public uses warm ivory + soft gold accents; Admin uses cool neutrals + restrained red for status only."
  },
  "design_personality": {
    "style_fusion": "Swiss clarity + premium jewellery editorial + subtle craft texture (paper/noise) + bento-grid cards.",
    "do_not": [
      "Do not make the public page look like an admin dashboard.",
      "Do not add any /admin links on public routes.",
      "Do not use transparent page backgrounds.",
      "Do not use heavy 3D."
    ]
  },
  "inspiration_refs": {
    "notes": "Use these as directional references (layout density, component rhythm, OTP patterns).",
    "urls": [
      {
        "title": "Jewellery Landing Page (Figma community)",
        "url": "https://www.figma.com/community/file/1338023167007783017/jewellery-landing-page",
        "use_for": ["premium hero composition", "editorial spacing", "product imagery framing"]
      },
      {
        "title": "OTP UX copy pattern (Candere)",
        "url": "https://www.candere.com/jewellery/gemstone/daily+wear.html?rating=4",
        "use_for": ["OTP verify/resend language", "step-by-step registration expectations"]
      },
      {
        "title": "Shadcn Blocks dashboards (layout references)",
        "url": "https://www.shadcnblocks.com/block/dashboard2",
        "use_for": ["admin KPI cards + table rhythm"]
      },
      {
        "title": "Shadcn Blocks dashboards (advanced density)",
        "url": "https://www.shadcnblocks.com/block/dashboard11",
        "use_for": ["admin charts + dense analytics layout"]
      }
    ]
  },
  "typography": {
    "google_fonts": {
      "heading": {
        "family": "Spectral",
        "fallback": "serif",
        "weights": [400, 600, 700],
        "usage": "Public hero headings + section titles to echo the serif YASH wordmark."
      },
      "body": {
        "family": "Manrope",
        "fallback": "system-ui",
        "weights": [400, 500, 600, 700],
        "usage": "All UI body, labels, helper text (public + admin)."
      },
      "admin_mono": {
        "family": "IBM Plex Mono",
        "fallback": "monospace",
        "weights": [400, 500],
        "usage": "Admin: phone numbers, IDs, OTP, CSV/export previews."
      }
    },
    "text_size_hierarchy": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl",
      "h2": "text-base md:text-lg",
      "body": "text-sm sm:text-base",
      "small": "text-xs sm:text-sm",
      "label": "text-sm font-medium",
      "numbers": "tabular-nums"
    },
    "letter_spacing": {
      "public_heading": "tracking-[-0.02em]",
      "admin_heading": "tracking-[-0.01em]",
      "badges": "tracking-wide uppercase"
    }
  },
  "color_system": {
    "strategy": "Navy + Red from logo, elevated with warm ivory and muted gold accents. Admin uses cooler neutrals for readability.",
    "tokens_css_variables": {
      "note": "Implement by overriding :root in /app/frontend/src/index.css (HSL values).",
      "public": {
        "--background": "36 33% 97%",
        "--foreground": "222 47% 11%",
        "--card": "0 0% 100%",
        "--card-foreground": "222 47% 11%",
        "--popover": "0 0% 100%",
        "--popover-foreground": "222 47% 11%",
        "--primary": "221 62% 18%",
        "--primary-foreground": "0 0% 98%",
        "--secondary": "36 25% 93%",
        "--secondary-foreground": "221 62% 18%",
        "--muted": "36 18% 92%",
        "--muted-foreground": "220 10% 40%",
        "--accent": "38 45% 88%",
        "--accent-foreground": "221 62% 18%",
        "--destructive": "0 72% 46%",
        "--destructive-foreground": "0 0% 98%",
        "--border": "30 18% 86%",
        "--input": "30 18% 86%",
        "--ring": "221 62% 18%",
        "--radius": "0.75rem",
        "brand": {
          "navy": "#0B1F3B",
          "red": "#C21F2B",
          "ivory": "#FBF7F0",
          "champagne": "#F2E6D3",
          "soft_gold": "#C8A96A",
          "graphite": "#111827"
        },
        "semantic": {
          "success": "#0F766E",
          "warning": "#B45309",
          "info": "#1D4ED8"
        }
      },
      "admin": {
        "--background": "210 20% 98%",
        "--foreground": "222 47% 11%",
        "--card": "0 0% 100%",
        "--card-foreground": "222 47% 11%",
        "--primary": "221 62% 18%",
        "--primary-foreground": "0 0% 98%",
        "--secondary": "210 16% 94%",
        "--secondary-foreground": "221 62% 18%",
        "--muted": "210 16% 93%",
        "--muted-foreground": "220 9% 46%",
        "--border": "214 18% 88%",
        "--ring": "221 62% 18%",
        "admin_accent": {
          "status_red": "#C21F2B",
          "status_green": "#0F766E",
          "status_gray": "#64748B"
        }
      }
    },
    "gradients": {
      "restriction": "Follow GRADIENT RESTRICTION RULE (no dark/saturated combos; max 20% viewport; never on reading areas).",
      "allowed_public_background_gradients": [
        {
          "name": "Ivory-to-champagne wash",
          "css": "bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(200,169,106,0.18),transparent_55%),radial-gradient(900px_circle_at_90%_10%,rgba(194,31,43,0.10),transparent_50%),linear-gradient(180deg,#FBF7F0_0%,#FFFFFF_55%,#FBF7F0_100%)]",
          "usage": "Public hero section background only (top ~18% of viewport)."
        }
      ],
      "admin_background": "No gradients. Use solid cool neutrals for readability."
    },
    "texture": {
      "noise_overlay": {
        "css": "bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.08%22/%3E%3C/svg%3E')]",
        "usage": "Public: apply as absolute overlay on hero only (pointer-events-none). Keep opacity <= 0.08."
      }
    }
  },
  "layout_and_grid": {
    "public": {
      "pattern": "Single-column mobile-first with a centered content rail; avoid centered text blocks except hero headline.",
      "container": "max-w-[560px] mx-auto px-4 sm:px-6",
      "sections": [
        "Top brand bar (logo + trust chips)",
        "Hero (headline + stepper)",
        "Enrollment card (Step 1 form)",
        "OTP verify card (Step 1b)",
        "Success card (Step 2 download)",
        "Footer (terms/privacy links only)"
      ],
      "spacing": {
        "section_y": "py-10 sm:py-14",
        "card_padding": "p-5 sm:p-6",
        "field_gap": "space-y-4",
        "touch_targets": "min-h-11"
      }
    },
    "admin": {
      "pattern": "Desktop-first 12-col grid with collapsible sidebar; content uses bento cards.",
      "shell": "min-h-screen bg-[hsl(var(--background))]",
      "sidebar": "w-[280px] shrink-0 border-r bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60",
      "content": "flex-1 px-4 py-6 lg:px-8",
      "grid": "grid grid-cols-1 gap-4 lg:grid-cols-12",
      "kpi_row": "lg:col-span-12 grid grid-cols-2 gap-3 md:grid-cols-4",
      "main_split": "lg:col-span-8",
      "right_rail": "lg:col-span-4"
    }
  },
  "components": {
    "component_path": {
      "public": {
        "header": ["/app/frontend/src/components/ui/navigation-menu.jsx", "custom simple header"],
        "stepper": ["/app/frontend/src/components/ui/progress.jsx", "/app/frontend/src/components/ui/badge.jsx", "/app/frontend/src/components/ui/separator.jsx"],
        "form": ["/app/frontend/src/components/ui/form.jsx", "/app/frontend/src/components/ui/input.jsx", "/app/frontend/src/components/ui/label.jsx", "/app/frontend/src/components/ui/checkbox.jsx", "/app/frontend/src/components/ui/button.jsx", "/app/frontend/src/components/ui/alert.jsx"],
        "otp": ["/app/frontend/src/components/ui/input-otp.jsx", "/app/frontend/src/components/ui/button.jsx"],
        "dialogs": ["/app/frontend/src/components/ui/dialog.jsx", "/app/frontend/src/components/ui/scroll-area.jsx"],
        "cards": ["/app/frontend/src/components/ui/card.jsx"],
        "toast": ["/app/frontend/src/components/ui/sonner.jsx"],
        "skeleton": ["/app/frontend/src/components/ui/skeleton.jsx"]
      },
      "admin": {
        "shell": ["/app/frontend/src/components/ui/sheet.jsx", "/app/frontend/src/components/ui/navigation-menu.jsx"],
        "kpis": ["/app/frontend/src/components/ui/card.jsx", "/app/frontend/src/components/ui/badge.jsx"],
        "tables": ["/app/frontend/src/components/ui/table.jsx", "/app/frontend/src/components/ui/pagination.jsx"],
        "filters": ["/app/frontend/src/components/ui/popover.jsx", "/app/frontend/src/components/ui/command.jsx", "/app/frontend/src/components/ui/select.jsx", "/app/frontend/src/components/ui/calendar.jsx"],
        "charts": ["Recharts (external)", "/app/frontend/src/components/ui/tooltip.jsx"],
        "detail": ["/app/frontend/src/components/ui/tabs.jsx", "/app/frontend/src/components/ui/accordion.jsx", "/app/frontend/src/components/ui/textarea.jsx"],
        "audit": ["/app/frontend/src/components/ui/scroll-area.jsx", "/app/frontend/src/components/ui/separator.jsx"],
        "toast": ["/app/frontend/src/components/ui/sonner.jsx"]
      }
    },
    "public_page_skeleton": {
      "hero": {
        "left": "Logo + headline + short trust line",
        "right": "Jewellery image card (optional on >=sm)",
        "trust_chips": ["Secure OTP verification", "No spam", "Takes < 2 minutes"]
      },
      "step_indicator": {
        "labels": ["Step 1: Enroll and verify", "Step 2: Download and log in"],
        "implementation": "Use a 2-step horizontal stepper: badges + connecting line; active step uses navy fill; completed uses soft gold border + check icon."
      },
      "step1_form": {
        "fields": ["Customer Name", "Phone Number (10 digits)", "Shop Name", "Location"],
        "consents": ["I agree to Terms", "I agree to Privacy"],
        "cta": "Send OTP",
        "validation": "Inline field errors under each input; phone must be exactly 10 digits; disable CTA until consents checked."
      },
      "otp_verify": {
        "otp": "4-digit InputOTP with 4 boxes",
        "timer": "Countdown (e.g., 00:45) with Resend disabled until 0",
        "cta": "Verify OTP",
        "secondary": "Change phone number link"
      },
      "step2_success": {
        "content": [
          "Enrollment success message",
          "Verified phone number displayed (monospace)",
          "Instruction paragraph exactly as provided",
          "Android download button (Android icon)",
          "iOS download button placeholder (Apple icon)",
          "QR code block"
        ]
      }
    },
    "admin_page_skeleton": {
      "login": "Phone + Send OTP, then OTP input; keep it minimal and separate from public styling.",
      "dashboard": [
        "KPI cards row",
        "Registration trend chart (area/line)",
        "Recent registrations table",
        "Recent logins list"
      ],
      "users": [
        "Filter bar (status, date range via Calendar, location, shop)",
        "Search input",
        "Table with pagination + CSV export",
        "Row click -> detail"
      ],
      "customer_detail": [
        "Profile header card",
        "Tabs: Overview | Activity | Notes | Audit",
        "Admin actions: edit, activate/deactivate"
      ],
      "modules": "Sidebar shows modules; pages can show a locked/pending state card."
    }
  },
  "buttons_and_controls": {
    "button_style": {
      "public": {
        "primary": "Luxury/Elegant: rounded-lg, tall, subtle shadow; navy fill; hover darken; active press scale.",
        "secondary": "Ghost/outline with navy border; hover bg navy/5.",
        "download": "Platform buttons: white surface, border, icon left, strong label."
      },
      "admin": {
        "primary": "Professional: medium radius, flat tonal fill; minimal shadow.",
        "danger": "Use destructive token only for destructive actions; confirm via AlertDialog."
      }
    },
    "tailwind_recipes": {
      "public_primary_button": "h-11 px-5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm shadow-black/5 hover:bg-[#081a31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 active:scale-[0.98] transition-colors",
      "public_outline_button": "h-11 px-5 rounded-lg border border-[#0B1F3B]/25 bg-white hover:bg-[#0B1F3B]/[0.04] text-[#0B1F3B] active:scale-[0.98] transition-colors",
      "chip": "inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs text-slate-700 backdrop-blur",
      "input": "h-11 rounded-lg bg-white border border-[hsl(var(--input))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2",
      "otp_slot": "h-12 w-12 rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-900 shadow-sm"
    }
  },
  "motion_and_microinteractions": {
    "library": {
      "recommended": "framer-motion",
      "install": "npm i framer-motion",
      "usage": "Use for step transitions (form -> otp -> success), KPI card entrance, subtle list item reveal."
    },
    "principles": [
      "Use motion to clarify state changes (step transitions), not decoration.",
      "Durations: 160–220ms for hover; 240–320ms for page/step transitions.",
      "Easing: cubic-bezier(0.2, 0.8, 0.2, 1).",
      "Respect prefers-reduced-motion: reduce."
    ],
    "public_interactions": [
      "Stepper: active step gently pulses once on entry (opacity/scale 1.02).",
      "Send OTP: show loading spinner + disable inputs.",
      "OTP slots: auto-advance; shake animation on invalid OTP (reduced motion safe).",
      "Success: confetti is optional but avoid heavy libs; prefer a tiny CSS sparkle accent near headline."
    ],
    "admin_interactions": [
      "Table row hover: subtle background tint + left border accent.",
      "Filter popovers: spring-in small scale (0.98->1).",
      "CSV export: toast with progress state."
    ]
  },
  "imagery": {
    "brand_assets": {
      "logo": "/brand/yash-logo-hd.png",
      "mark": "/brand/yash-mark-hd.png",
      "usage": "Public header uses full logo; admin uses mark-only in sidebar header for compactness."
    },
    "image_urls": [
      {
        "category": "public_hero_image",
        "description": "Close-up jewellery/ring shot with bokeh; place in a rounded card on the hero (hidden on xs).",
        "url": "https://images.unsplash.com/photo-1580582183555-3224a02343c8?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "public_supporting_image",
        "description": "Hands holding ring; use as a small side image near trust chips or as a blurred background in a small decorative block.",
        "url": "https://images.unsplash.com/photo-1719558592073-1edc6da8c73b?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "public_texture_or_minimal",
        "description": "Minimal silver ring on light surface; use for empty states or subtle section divider imagery.",
        "url": "https://images.unsplash.com/photo-1593554466439-3c9978dd302c?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85"
      }
    ],
    "qr_code": {
      "generation": "Generate QR client-side (lightweight) using qrcode.react.",
      "install": "npm i qrcode.react",
      "style": "Render on white card with border; size 160–200px; include caption 'Scan to download'."
    }
  },
  "accessibility": {
    "requirements": [
      "All inputs must have visible labels (Label component).",
      "Error messages must be programmatically associated (aria-describedby).",
      "Focus states: ring-2 with ring color; never remove outline without replacement.",
      "Touch targets >= 44px height on public.",
      "Use tabular-nums for OTP/timers/phone numbers.",
      "Color contrast: ensure navy text on ivory meets WCAG AA; red used mainly for accents/errors, not body text."
    ]
  },
  "testing_attributes": {
    "rule": "All interactive and key informational elements MUST include data-testid (kebab-case, role-based).",
    "public_examples": [
      "data-testid=\"public-enroll-name-input\"",
      "data-testid=\"public-enroll-phone-input\"",
      "data-testid=\"public-enroll-send-otp-button\"",
      "data-testid=\"public-otp-input\"",
      "data-testid=\"public-otp-resend-button\"",
      "data-testid=\"public-success-verified-phone\"",
      "data-testid=\"public-download-android-button\"",
      "data-testid=\"public-download-ios-button\"",
      "data-testid=\"public-terms-link\"",
      "data-testid=\"public-privacy-link\""
    ],
    "admin_examples": [
      "data-testid=\"admin-login-phone-input\"",
      "data-testid=\"admin-login-send-otp-button\"",
      "data-testid=\"admin-dashboard-total-customers-card\"",
      "data-testid=\"admin-users-search-input\"",
      "data-testid=\"admin-users-export-csv-button\"",
      "data-testid=\"admin-users-table\"",
      "data-testid=\"admin-user-detail-activate-toggle\""
    ]
  },
  "admin_data_viz": {
    "charts_library": {
      "recommended": "recharts",
      "install": "npm i recharts",
      "components": ["AreaChart", "LineChart", "ResponsiveContainer", "Tooltip", "CartesianGrid", "XAxis", "YAxis"]
    },
    "chart_style": {
      "palette": {
        "line_primary": "#0B1F3B",
        "fill_primary": "rgba(11,31,59,0.10)",
        "line_accent": "#C8A96A",
        "grid": "rgba(15,23,42,0.08)"
      },
      "empty_state": "Show Skeleton in Card; if no data, show a centered message + 'No registrations yet' with a subtle icon."
    }
  },
  "public_copy_guidance": {
    "hero_heading": "Become a Part of the Yash Ornaments Scheme",
    "step_labels": ["Enroll and verify", "Download and log in"],
    "success_instructions": "Your registration is complete. Download the Yash Trade App and log in using your registered phone number. A one-time password will be sent to your phone when you log in."
  },
  "instructions_to_main_agent": {
    "global_css_cleanup": [
      "Remove/ignore /app/frontend/src/App.css default CRA styles (dark centered header). Do NOT center align the app container.",
      "Override /app/frontend/src/index.css :root tokens to the provided public palette; optionally add an .admin scope class on admin layout to swap to admin tokens.",
      "Add Google Fonts imports for Spectral, Manrope, IBM Plex Mono in index.html or via CSS @import (prefer <link> in public/index.html)."
    ],
    "public_implementation_notes": [
      "Public route '/' is a single stateful page with steps: form -> otp -> success.",
      "Use shadcn Form + zod (if present) for validation; show field-level errors.",
      "Use InputOTP component for 4-digit OTP; include countdown + resend.",
      "Use Dialog for Terms/Privacy on mobile (or separate routes /terms and /privacy).",
      "No admin links anywhere on public pages."
    ],
    "admin_implementation_notes": [
      "Admin uses a separate layout shell with sidebar; keep it visually distinct (cool neutrals, denser spacing).",
      "Use Table + Pagination; filters in Popover/Command; date range uses Calendar.",
      "Some sidebar modules can render a 'Live connection pending' Card with muted styling."
    ],
    "iconography": {
      "rule": "Use lucide-react icons only (no emojis).",
      "download_icons": ["Android", "Apple"],
      "status_icons": ["CheckCircle2", "XCircle", "Clock", "ShieldCheck"]
    }
  }
}

<General UI UX Design Guidelines>  
    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms
    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text
   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json

 **GRADIENT RESTRICTION RULE**
NEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc
NEVER use dark gradients for logo, testimonial, footer etc
NEVER let gradients cover more than 20% of the viewport.
NEVER apply gradients to text-heavy content or reading areas.
NEVER use gradients on small UI elements (<100px width).
NEVER stack multiple gradient layers in the same viewport.

**ENFORCEMENT RULE:**
    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors

**How and where to use:**
   • Section backgrounds (not content backgrounds)
   • Hero section header content. Eg: dark to light to dark color
   • Decorative overlays and accent elements only
   • Hero section with 2-3 mild color
   • Gradients creation can be done for any angle say horizontal, vertical or diagonal

- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**

</Font Guidelines>

- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. 
   
- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.

- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.
   
- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly
    Eg: - if it implies playful/energetic, choose a colorful scheme
           - if it implies monochrome/minimal, choose a black–white/neutral scheme

**Component Reuse:**
	- Prioritize using pre-existing components from src/components/ui when applicable
	- Create new components that match the style and conventions of existing components when needed
	- Examine existing components to understand the project's component patterns before creating new ones

**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component

**Best Practices:**
	- Use Shadcn/UI as the primary component library for consistency and accessibility
	- Import path: ./components/[component-name]

**Export Conventions:**
	- Components MUST use named exports (export const ComponentName = ...)
	- Pages MUST use default exports (export default function PageName() {...})

**Toasts:**
  - Use `sonner` for toasts"
  - Sonner component are located in `/app/src/components/ui/sonner.tsx`

Use 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.
</General UI UX Design Guidelines>
