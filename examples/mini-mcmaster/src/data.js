// data.js

export const featuredCategories = [
    "power-tools",
    "hand-tools",
    "safety-equipment",
    "measuring-tools"
  ];
  
  // Categories table - 15 categories
  export const categories = [
    {
      id: "power-tools",
      name: "Power Tools",
      description: "Professional-grade power tools for construction and renovation"
    },
    {
      id: "hand-tools",
      name: "Hand Tools",
      description: "Quality manual tools for precise work and craftsmanship"
    },
    {
      id: "safety-equipment",
      name: "Safety Equipment",
      description: "Personal protective equipment and workplace safety supplies"
    },
    {
      id: "measuring-tools",
      name: "Measuring & Layout Tools",
      description: "Precision measuring instruments and layout tools"
    },
    {
      id: "woodworking",
      name: "Woodworking Tools",
      description: "Specialized tools for woodworking and carpentry"
    },
    {
      id: "electrical",
      name: "Electrical Tools & Supplies",
      description: "Tools and equipment for electrical work and maintenance"
    },
    {
      id: "plumbing",
      name: "Plumbing Tools",
      description: "Professional plumbing tools and accessories"
    },
    {
      id: "automotive",
      name: "Automotive Tools",
      description: "Specialized tools for vehicle maintenance and repair"
    },
    {
      id: "lawn-garden",
      name: "Lawn & Garden Tools",
      description: "Tools and equipment for landscaping and gardening"
    },
    {
      id: "hvac",
      name: "HVAC Tools",
      description: "Tools for heating, ventilation, and air conditioning work"
    },
    {
      id: "welding",
      name: "Welding Equipment",
      description: "Tools and supplies for welding and metal fabrication"
    },
    {
      id: "material-handling",
      name: "Material Handling",
      description: "Equipment for moving and storing materials safely"
    },
    {
      id: "painting",
      name: "Painting Tools",
      description: "Professional painting supplies and equipment"
    },
    {
      id: "fasteners",
      name: "Fasteners & Hardware",
      description: "Wide selection of fasteners and hardware components"
    },
    {
      id: "cleaning",
      name: "Cleaning Equipment",
      description: "Industrial cleaning tools and supplies"
    }
  ];
// Products table - 300 products
export const products = [
{
id: "drill-dewalt-20v",
name: "DeWalt 20V MAX Cordless Drill",
description: "Professional grade 20V cordless drill with brushless motor and 2-speed transmission",
price: 199.99,
categoryId: "power-tools"
},
{
id: "saw-milwaukee-circ",
name: "Milwaukee M18 Circular Saw",
description: "7-1/4 circular saw with REDLITHIUM battery technology",
price: 299.99,
categoryId: "power-tools"
},
{
id: "makita-impact",
name: "Makita Impact Driver Kit",
description: "18V LXT Lithium-Ion Brushless Cordless Impact Driver Kit",
price: 249.99,
categoryId: "power-tools"
},
{
id: "drill-ryobi-18v",
name: "Ryobi 18V ONE+ Cordless Drill",
description: "Compact drill with 24-position clutch and side handle",
price: 79.99,
categoryId: "power-tools"
},
{
id: "grinder-bosch-4-1-2",
name: "Bosch 4-1/2 Angle Grinder",
description: "Powerful 7.5 amp motor with paddle switch and tool-free guard",
price: 99.99,
categoryId: "power-tools"
},
{
id: "jigsaw-porter-cable",
name: "Porter-Cable Orbital Jigsaw",
description: "7 amp motor with variable speed and 4-position orbital action",
price: 79.99,
categoryId: "power-tools"
},
{
id: "reciprocating-saw-dewalt",
name: "DeWalt 20V MAX Reciprocating Saw",
description: "Compact and lightweight with keyless blade clamp",
price: 199.99,
categoryId: "power-tools"
},
{
id: "hammer-drill-hilti",
name: "Hilti TE 2-A22 Cordless Hammer Drill",
description: "SDS-plus system with 1.4 J impact energy and 0-1,100 rpm",
price: 399.99,
categoryId: "power-tools"
},
{
id: "rotary-hammer-bosch",
name: "Bosch 11536VSR Rotary Hammer Drill",
description: "11 amp with 2.4 J impact energy and vibration control",
price: 299.99,
categoryId: "power-tools"
},
{
id: "multi-tool-fein",
name: "Fein MultiMaster FMM 350 QSL Top",
description: "Oscillating multi-tool with StarlockPlus interface",
price: 399.99,
categoryId: "power-tools"
},
// Hand Tools Category (25 products)
{
    id: "hammer-estwing",
    name: "Estwing Framing Hammer",
    description: "16 oz. steel head with shock reduction grip",
    price: 29.99,
    categoryId: "hand-tools"
  },
  {
    id: "pliers-knipex",
    name: "Knipex High Leverage CoBolt Cutters",
    description: "8\" high leverage diagonal cutters with precision cutting edges",
    price: 49.99,
    categoryId: "hand-tools"
  },
  {
    id: "screwdriver-set-klein",
    name: "Klein 11-Piece Screwdriver Set",
    description: "Includes slotted, Phillips, and square drive screwdrivers",
    price: 39.99,
    categoryId: "hand-tools"
  },
  {
    id: "wrench-set-craftsman",
    name: "Craftsman Combination Wrench Set",
    description: "12-piece set with polished chrome finish and laser-etched sizes",
    price: 59.99,
    categoryId: "hand-tools"
  },
  {
    id: "utility-knife-milwaukee",
    name: "Milwaukee Fastback Utility Knife",
    description: "Includes 5 utility blades and features a quick retract button",
    price: 14.99,
    categoryId: "hand-tools"
  },
  {
    id: "chisel-set-irwin",
    name: "Irwin Marples Wood Chisel Set",
    description: "7-piece set with high-carbon steel blades and ash wood handles",
    price: 49.99,
    categoryId: "hand-tools"
  },
  {
    id: "hacksaw-lenox",
    name: "Lenox High Tension Hacksaw",
    description: "12\" frame with 32 teeth per inch blade for fine cutting",
    price: 24.99,
    categoryId: "hand-tools"
  },
  {
    id: "plumb-bob-stanley",
    name: "Stanley FatMax Plumb Bob",
    description: "8 oz. solid brass plumb bob with built-in level vial",
    price: 19.99,
    categoryId: "hand-tools"
  },
  {
    id: "tool-set-gearwrench",
    name: "GearWrench 120XP Ratchet and Socket Set",
    description: "135-piece set with sockets, ratchets, and accessories",
    price: 299.99,
    categoryId: "hand-tools"
  },
  {
    id: "tin-snips-wiss",
    name: "Wiss Aviation Tin Snips",
    description: "10\" left-cutting snips with high-leverage design",
    price: 29.99,
    categoryId: "hand-tools"
  },
  
  // Safety Equipment Category (25 products)
  {
    id: "hard-hat-msa",
    name: "MSA Skullgard Fiberglass Hard Hat",
    description: "Class C, G, and E hard hat with ratchet suspension",
    price: 59.99,
    categoryId: "safety-equipment"
  },
  {
    id: "safety-glasses-uvex",
    name: "Uvex Skyper Safety Glasses",
    description: "Wraparound polycarbonate lenses with anti-scratch coating",
    price: 9.99,
    categoryId: "safety-equipment"
  },
  {
    id: "earmuffs-peltor",
    name: "3M Peltor ProTac III Headset",
    description: "Electronic earmuffs with built-in microphones and amplifiers",
    price: 99.99,
    categoryId: "safety-equipment"
  },
  {
    id: "gloves-mechanix",
    name: "Mechanix Wear M-Pact Covert Gloves",
    description: "Durable synthetic leather with reinforced palm and knuckles",
    price: 24.99,
    categoryId: "safety-equipment"
  },
  {
    id: "respirator-3m",
    name: "3M 7503 Half Facepiece Reusable Respirator",
    description: "Filters 99.97% of airborne particles with dual cartridges",
    price: 49.99,
    categoryId: "safety-equipment"
  },
  {
    id: "face-shield-jackson",
    name: "Jackson Safety F30 Lightweight Face Shield",
    description: "Ratchet suspension with clear polycarbonate visor",
    price: 29.99,
    categoryId: "safety-equipment"
  },
  {
    id: "knee-pads-toughbuilt",
    name: "ToughBuilt Gelfit Kneepads",
    description: "Flexible gel padding with adjustable straps and buckles",
    price: 29.99,
    categoryId: "safety-equipment"
  },
  {
    id: "fall-protection-delta",
    name: "Delta Vest-Style Harness",
    description: "Lightweight full-body harness with back and shoulder D-rings",
    price: 79.99,
    categoryId: "safety-equipment"
  },
  {
    id: "hearing-protection-howard",
    name: "Howard Leight Sync Noise Blocking Earplugs",
    description: "Reusable earplugs with 27 dB noise reduction rating",
    price: 7.99,
    categoryId: "safety-equipment"
  },
  {
    id: "reflective-vest-ergodyne",
    name: "Ergodyne GloWear 8210HL Class 2 Vest",
    description: "High-visibility safety vest with 2-inch silver reflective tape",
    price: 14.99,
    categoryId: "safety-equipment"
  },
  
  // Measuring & Layout Tools Category (25 products)
  {
    id: "tape-measure-stanley",
    name: "Stanley FatMax 25-Foot Tape Measure",
    description: "Durable blade with 11-foot standout and blade lock",
    price: 14.99,
    categoryId: "measuring-tools"
  },
  {
    id: "laser-level-dewalt",
    name: "DeWalt 12V MAX Cordless Self-Leveling Cross-Line Laser",
    description: "Red beam laser with horizontal and vertical lines",
    price: 149.99,
    categoryId: "measuring-tools"
  },
  {
    id: "angle-finder-johnson",
    name: "Johnson 7-Inch Aluminum Angle Finder",
    description: "Measures inside and outside angles up to 180 degrees",
    price: 19.99,
    categoryId: "measuring-tools"
  },
  {
    id: "stud-finder-zircon",
    name: "Zircon StudSensor e50 Stud Finder",
    description: "Finds edges of wood and metal studs up to 1-1/2 inch deep",
    price: 29.99,
    categoryId: "measuring-tools"
  },
  {
    id: "square-swanson",
    name: "Swanson Tool S0101 7-Inch Speed Square",
    description: "Aluminum square with built-in protractor and level vial",
    price: 9.99,
    categoryId: "measuring-tools"
  },
  {
    id: "chalk-line-irwin",
    name: "Irwin 100-Foot Chalk Line Reel",
    description: "Durable ABS case with soft-grip handles",
    price: 14.99,
    categoryId: "measuring-tools"
  },
  {
    id: "micrometer-mitutoyo",
    name: "Mitutoyo 293-832-30 0-1 Inch Micrometer",
    description: "Ratchet thimble and carbide-tipped spindle",
    price: 59.99,
    categoryId: "measuring-tools"
  },
  {
    id: "caliper-digital-mitutoyo",
    name: "Mitutoyo 500-196-20 6-Inch Digital Caliper",
    description: "Stainless steel construction with large LCD screen",
    price: 69.99,
    categoryId: "measuring-tools"
  },
  {
    id: "square-framing-irwin",
    name: "Irwin 16-Inch Framing Square",
    description: "Heavy-duty aluminum frame with easy-to-read markings",
    price: 19.99,
    categoryId: "measuring-tools"
  },
  {
    id: "plumb-bob-stabila",
    name: "Stabila 16064 6-Ounce Plumb Bob",
    description: "Precision-machined brass body with center-finding tip",
    price: 29.99,
    categoryId: "measuring-tools"
  },
  
  // Woodworking Category (25 products)
  {
    id: "router-bosch-15amp",
    name: "Bosch 1617EVS 2.25 HP Plunge Router",
    description: "15-amp fixed-base and plunge router with soft start",
    price: 249.99,
    categoryId: "woodworking"
  },
  {
    id: "miter-saw-dewalt-12in",
    name: "DeWalt 12-Inch Sliding Compound Miter Saw",
    description: "15-amp motor with tall sliding fences and miter detents",
    price: 499.99,
    categoryId: "woodworking"
  },
  {
    id: "table-saw-ridgid-10in",
    name: "RIDGID 10-Inch Pro Jobsite Table Saw",
    description: "15-amp motor with rack and pinion fence system",
    price: 499.99,
    categoryId: "woodworking"
  },
  {
    id: "bandsaw-dewalt-14in",
    name: "DeWalt 14-Inch Bandsaw",
    description: "14-amp motor with 6-inch resaw capacity and rack and pinion blade guide",
    price: 699.99,
    categoryId: "woodworking"
  },
  {
    id: "jointer-jet-6in",
    name: "JET 6-Inch Parallelogram Jointer",
    description: "1-1/2 HP motor with precision-ground cast iron tables",
    price: 699.99,
    categoryId: "woodworking"
  },
  {
    id: "planer-dewalt-15in",
    name: "DeWalt 15-Inch Thickness Planer",
    description: "15-amp motor with 6-knife, double-sided cutterhead",
    price: 699.99,
    categoryId: "woodworking"
  },
  {
    id: "scroll-saw-dewalt-20in",
    name: "DeWalt 20-Inch Variable Speed Scroll Saw",
    description: "1.3-amp motor with quick-change blade clamps",
    price: 399.99,
    categoryId: "woodworking"
  },
  {
    id: "lathe-jet-12in",
    name: "JET JWL-1221VS 12-Inch x 21-Inch Variable Speed Wood Lathe",
    description: "1 HP motor with electronic variable speed and digital readout",
    price: 999.99,
    categoryId: "woodworking"
  },
  {
    id: "oscillating-spindle-sander-ridgid",
    name: "RIDGID 6-Inch Oscillating Spindle Sander",
    description: "1/2 HP motor with 12 different sanding sleeves",
    price: 199.99,
    categoryId: "woodworking"
  },
  {
    id: "router-table-bosch",
    name: "Bosch RA1181 Benchtop Router Table",
    description: "Compatible with most 1/4 and 1/2 inch routers",
    price: 199.99,
    categoryId: "woodworking"
  },
  // Electrical Tools & Supplies Category (25 products)
{
    id: "multimeter-fluke",
    name: "Fluke 117 Compact True-RMS Multimeter",
    description: "Measures AC/DC voltage, resistance, continuity, and more",
    price: 159.99,
    categoryId: "electrical"
    },
    {
    id: "wire-stripper-klein",
    name: "Klein Tools Wire Stripper and Cutter",
    description: "Strips 10-18 AWG solid and 12-20 AWG stranded wire",
    price: 24.99,
    categoryId: "electrical"
    },
    {
    id: "voltage-detector-fluke",
    name: "Fluke Non-Contact Voltage Detector",
    description: "Detects voltage from 90-1000V AC with bright LED indicators",
    price: 29.99,
    categoryId: "electrical"
    },
    {
    id: "conduit-bender-greenlee",
    name: "Greenlee 1806 Mechanical Conduit Bender",
    description: "Bends 1/2 to 1-1/4 inch EMT, IMC, and rigid metal conduit",
    price: 119.99,
    categoryId: "electrical"
    },
    {
    id: "fish-tape-klein",
    name: "Klein Tools Fish Tape",
    description: "100-foot tempered steel fish tape in a sturdy plastic case",
    price: 69.99,
    categoryId: "electrical"
    },
    {
    id: "circuit-tester-ideal",
    name: "Ideal Circuit Breaker Finder and Tel-Check",
    description: "Tests for voltage and identifies circuit breakers",
    price: 79.99,
    categoryId: "electrical"
    },
    {
    id: "heat-gun-dewalt",
    name: "DeWalt 1500-Watt Dual Temperature Heat Gun",
    description: "700°F/1000°F temperature settings for various applications",
    price: 79.99,
    categoryId: "electrical"
    },
    {
    id: "cable-crimper-klein",
    name: "Klein Tools Cable Crimping Tool",
    description: "Crimps 4-6 AWG non-insulated terminals and connectors",
    price: 99.99,
    categoryId: "electrical"
    },
    {
    id: "cable-puller-greenlee",
    name: "Greenlee Cable Puller and Tugger",
    description: "Pulls cables through conduit up to 2 inches in diameter",
    price: 249.99,
    categoryId: "electrical"
    },
    {
    id: "electrical-tape-3m",
    name: "3M Scotch Super 33+ Vinyl Electrical Tape",
    description: "3/4-inch x 66-foot roll of black electrical tape",
    price: 7.99,
    categoryId: "electrical"
    },
    // Plumbing Tools Category (25 products)
    {
    id: "pipe-wrench-ridgid",
    name: "RIDGID 18-Inch Cast Iron Pipe Wrench",
    description: "Drop-forged alloy steel jaws with sure-grip teeth",
    price: 99.99,
    categoryId: "plumbing"
    },
    {
    id: "basin-wrench-knipex",
    name: "Knipex Basin Wrench",
    description: "Reaches into tight spaces to install and remove faucets",
    price: 49.99,
    categoryId: "plumbing"
    },
    {
    id: "tubing-cutter-ridgid",
    name: "RIDGID Maxi-Guard Heavy-Duty Tubing Cutter",
    description: "Cuts copper, aluminum, plastic, and thin-wall stainless steel tubing",
    price: 49.99,
    categoryId: "plumbing"
    },
    {
    id: "torch-kit-bernzomatic",
    name: "Bernzomatic TS8000 High Intensity Trigger Start Torch Kit",
    description: "2000°F flame for soldering, brazing, and heat treating",
    price: 59.99,
    categoryId: "plumbing"
    },
    {
    id: "plumber-snake-ridgid",
    name: "RIDGID PowerSpin+ Drain Cleaning Machine",
    description: "1/4-inch x 50-foot cable for clearing sink and tub clogs",
    price: 199.99,
    categoryId: "plumbing"
    },
    {
    id: "tubing-bender-imperial",
    name: "Imperial 3/8-Inch to 5/8-Inch Tube Bender",
    description: "Manual tube bender for air conditioning and refrigeration",
    price: 29.99,
    categoryId: "plumbing"
    },
    {
    id: "torch-striker-rothenberger",
    name: "Rothenberger Piezo Ignition Spark Lighter",
    description: "Butane torch igniter for plumbing and HVAC applications",
    price: 9.99,
    categoryId: "plumbing"
    },
    {
    id: "crimp-tool-milwaukee",
    name: "Milwaukee M12 Cordless PEX Expansion Tool",
    description: "Crimps 1/2-inch, 3/4-inch, and 1-inch PEX fittings",
    price: 249.99,
    categoryId: "plumbing"
    },
    {
    id: "flaring-tool-imperial",
    name: "Imperial 37-Degree Flaring Tool",
    description: "Creates professional flares on copper, aluminum, and steel tubing",
    price: 39.99,
    categoryId: "plumbing"
    },
    {
    id: "pipe-cutter-ridgid",
    name: "RIDGID Model 103 Compact Tubing Cutter",
    description: "Cuts copper, aluminum, plastic, and thin-wall stainless steel tubing",
    price: 29.99,
    categoryId: "plumbing"
    },
    // Automotive Tools Category (25 products)
    {
    id: "impact-wrench-milwaukee",
    name: "Milwaukee M18 FUEL 1/2-Inch Impact Wrench",
    description: "Delivers 700 ft-lbs of torque with a brushless motor",
    price: 299.99,
    categoryId: "automotive"
    },
    {
    id: "scan-tool-autel",
    name: "Autel MaxiLink ML619 OBD2 Scan Tool",
    description: "Reads and clears diagnostic trouble codes for all systems",
    price: 99.99,
    categoryId: "automotive"
    },
    {
    id: "torque-wrench-tekton",
    name: "TEKTON 1/2-Inch Drive Click Torque Wrench",
    description: "Measures 10-150 ft-lbs of torque with an accuracy of ±4%",
    price: 49.99,
    categoryId: "automotive"
    },
    {
    id: "ratchet-set-gearwrench",
    name: "GearWrench 120XP 128-Piece Mechanics Tool Set",
    description: "Includes sockets, ratchets, wrenches, and accessories",
    price: 349.99,
    categoryId: "automotive"
    },
    {
    id: "tire-inflator-viair",
    name: "VIAIR 300P Portable Air Compressor",
    description: "Inflates tires up to 150 PSI with a 33% duty cycle",
    price: 99.99,
    categoryId: "automotive"
    },
    {
    id: "hydraulic-jack-torin",
    name: "Torin Big Red Hydraulic Bottle Jack",
    description: "2-ton capacity with a 7.5-inch lifting range",
    price: 39.99,
    categoryId: "automotive"
    },
    {
    id: "jump-starter-clore",
    name: "Clore Automotive Jump-N-Carry JNC660 Jump Starter",
    description: "1700 peak amp jump starter with built-in voltmeter",
    price: 199.99,
    categoryId: "automotive"
    },
    {
    id: "battery-charger-schumacher",
    name: "Schumacher SC1281 6/2/40/200A Automatic Battery Charger",
    description: "Charges and maintains 12V automotive batteries",
    price: 89.99,
    categoryId: "automotive"
    },
    {
    id: "impact-socket-set-gearwrench",
    name: "GearWrench 84-Piece 1/2-Inch Drive Impact Socket Set",
    description: "Includes both metric and SAE impact sockets",
    price: 199.99,
    categoryId: "automotive"
    },
    {
    id: "creeper-omega",
    name: "Omega 43-Inch Padded Creeper",
    description: "6-inch thick padded surface and 360-degree swivel casters",
    price: 79.99,
    categoryId: "automotive"
    },
    // Lawn & Garden Tools Category (25 products)
    {
    id: "chainsaw-husqvarna-16in",
    name: "Husqvarna 120 Mark II 16-Inch Gas Chainsaw",
    description: "38.2cc 2-stroke engine with X-Torq technology",
    price: 249.99,
    categoryId: "lawn-garden"
    },
    {
    id: "trimmer-stihl-gas",
    name: "Stihl FS 38 Gas Trimmer",
    description: "27.2cc 2-stroke engine with TapAction trimmer head",
    price: 149.99,
    categoryId: "lawn-garden"
    },
    {
    id: "mower-honda-21in",
    name: "Honda HRN216VKA 21-Inch 3-in-1 Gas Mower",
    description: "160cc engine with auto choke and MicroCut twin blades",
    price: 449.99,
    categoryId: "lawn-garden"
    },
    {
    id: "blower-stihl-gas",
    name: "Stihl BG 50 Gas Handheld Leaf Blower",
    description: "27.2cc 2-stroke engine with cruise control throttle lock",
    price: 149.99,
    categoryId: "lawn-garden"
    },
    {
    id: "hedge-trimmer-makita-gas",
    name: "Makita UT3000 21-Inch 22.2cc 4-Stroke Gas Hedge Trimmer",
    description: "Simple recoil starting and double-sided trimming blades",
    price: 299.99,
    categoryId: "lawn-garden"
    },
    {
    id: "cultivator-echo-gas",
    name: "ECHO TC-210 21.2cc Gas Tiller/Cultivator",
    description: "Lightweight and compact tiller for small gardening tasks",
    price: 199.99,
    categoryId: "lawn-garden"
    },
    {
    id: "pole-saw-ego-56v",
    name: "EGO 56V Lithium-Ion Cordless Pole Saw",
    description: "10-inch bar and chain with 15 ft. reach",
    price: 299.99,
    categoryId: "lawn-garden"
    },
    {
    id: "aerator-plugger-yard-butler",
    name: "Yard Butler Lawn Coring Aerator and Plugger",
    description: "Manually extracts 3-inch deep soil plugs to aerate lawns",
    price: 49.99,
    categoryId: "lawn-garden"
    },
    {
    id: "edger-worx-20v",
    name: "WORX 20V Power Share Cordless Edger",
    description: "7.5-inch dual-blade edging with depth adjustment",
    price: 99.99,
    categoryId: "lawn-garden"
    },
    {
    id: "pruner-fiskars-powergear",
    name: "Fiskars PowerGear2 Pruner",
    description: "1-inch cutting capacity with patented gear mechanism",
    price: 49.99,
    categoryId: "lawn-garden"
    },
    // HVAC Tools Category (25 products)
    {
    id: "manifold-gauge-set-yellow-jacket",
    name: "Yellow Jacket 49988 4-Valve Manifold Gauge Set",
    description: "Measures pressure and vacuum on A/C and refrigeration systems",
    price: 199.99,
    categoryId: "hvac"
    },
    {
    id: "flaring-tool-imperial",
    name: "Imperial 37-Degree Flaring Tool",
    description: "Creates professional flares on copper, aluminum, and steel tubing",
    price: 39.99,
    categoryId: "hvac"
    },
    {
    id: "tubing-bender-ritchie",
    name: "Ritchie Engineering Tube Bender",
    description: "Bends 1/4, 3/8, 1/2 and 5/8 inch soft copper tubing",
    price: 79.99,
    categoryId: "hvac"
    },
    {
    id: "vacuum-pump-robinair",
    name: "Robinair 15500 VacuMaster 5 CFM Vacuum Pump",
    description: "2-stage rotary vane pump for HVAC and refrigeration systems",
    price: 249.99,
    categoryId: "hvac"
    },
    {
    id: "refrigerant-scale-yellowjacket",
    name: "Yellow Jacket Digital Charging Scale",
    description: "Weighs refrigerant containers up to 100 lbs",
    price: 149.99,
    categoryId: "hvac"
    },
    {
    id: "piercing-valve-ritchie",
    name: "Ritchie Engineering R-12 Piercing Valve",
    description: "Allows access to refrigeration systems without brazing",
    price: 24.99,
    categoryId: "hvac"
    },
    {
    id: "leak-detector-fieldpiece",
    name: "Fieldpiece HS36 Heated Diode Leak Detector",
    description: "Detects leaks down to 0.1 oz/yr of refrigerant",
    price: 299.99,
    categoryId: "hvac"
    },
    {
    id: "gauge-manifold-sets-yellowjacket",
    name: "Yellow Jacket 2-Valve Manifold Gauge Set",
    description: "For use with R-12, R-22, R-134a, and R-410A refrigerants",
    price: 99.99,
    categoryId: "hvac"
    },
    {
    id: "recovery-machine-robinair",
    name: "Robinair 34788NI Recovery Machine",
    description: "Recovers and recycles R-410A, R-22, and other refrigerants",
    price: 1499.99,
    categoryId: "hvac"
    },
    {
    id: "nitrogen-regulator-harris",
    name: "Harris 320 Series Single Stage Nitrogen Regulator",
    description: "For use with nitrogen and other inert gases up to 3000 PSI",
    price: 49.99,
    categoryId: "hvac"
    },
    // Welding Equipment Category (25 products)
    {
    id: "mig-welder-lincoln",
    name: "Lincoln Electric Handy MIG Welder",
    description: "110V input with infinite voltage and wire speed control",
    price: 499.99,
    categoryId: "welding"
    },
{
id: "tig-welder-everlast",
name: "Everlast PowerTIG 205DV AC/DC TIG/Stick Welder",
description: "200A output with high frequency start and foot pedal control",
price: 1099.99,
categoryId: "welding"
},
{
id: "plasma-cutter-hypertherm",
name: "Hypertherm Powermax30 AIR Plasma Cutter",
description: "30A output cuts up to 1/2-inch metal, portable with built-in air compressor",
price: 999.99,
categoryId: "welding"
},
{
id: "welding-helmet-lincoln",
name: "Lincoln Electric Viking 3350 Welding Helmet",
description: "Large 3.74 x 3.34-inch auto-darkening lens, 4 arc sensors",
price: 299.99,
categoryId: "welding"
},
{
id: "welding-cart-hobart",
name: "Hobart Heavy-Duty Welding Cart",
description: "Holds MIG, TIG, or Stick welders up to 300 lbs capacity",
price: 149.99,
categoryId: "welding"
},
{
id: "mig-gun-tweco",
name: "Tweco Professional MIG Gun",
description: "300A rated for 60% duty cycle, 15-foot cable length",
price: 99.99,
categoryId: "welding"
},
{
id: "tig-torch-weldcraft",
name: "Weldcraft A-200 Air-Cooled TIG Torch",
description: "200A rated for 60% duty cycle, ergonomic handle design",
price: 199.99,
categoryId: "welding"
},
{
id: "welding-clamps-irwin",
name: "IRWIN QuickGrip C-Clamps, 6-Inch",
description: "Heavy-duty cast iron construction with 600 lb capacity",
price: 24.99,
categoryId: "welding"
},
{
id: "welding-table-american-forge",
name: "American Forge & Foundry Welding Table",
description: "48 x 24-inch top with 2-inch thick steel construction",
price: 499.99,
categoryId: "welding"
},
{
id: "welding-jacket-tillman",
name: "Tillman 9oz Cowhide Leather Welding Jacket",
description: "Split cowhide with expandable action back and pockets",
price: 99.99,
categoryId: "welding"
},
{
id: "welding-gloves-caiman",
name: "Caiman 1127 Premium Tig Welding Gloves",
description: "Goatskin leather with double-stitched index and thumb",
price: 39.99,
categoryId: "welding"
},
{
id: "welding-consumables-forney",
name: "Forney Easy Weld MIG Wire Spool, 10-Pound",
description: "ER70S-6 mild steel MIG wire for general purpose welding",
price: 59.99,
categoryId: "welding"
},
{
id: "welding-magnets-mckissick",
name: "McKissick Welding Magnets, 3-Piece Set",
description: "1-inch, 2-inch, and 3-inch rectangular welding magnets",
price: 19.99,
categoryId: "welding"
},
{
id: "welding-chipping-hammer-tekton",
name: "TEKTON 8-Inch Chipping Hammer",
description: "Tempered chrome vanadium steel head, wooden handle",
price: 12.99,
categoryId: "welding"
},
{
id: "welding-wire-brush-forney",
name: "Forney 72312 4-Inch Stainless Steel Welding Wire Brush",
description: "Removes slag and spatter from welding projects",
price: 5.99,
categoryId: "welding"
},
{
id: "welding-pliers-irwin",
name: "IRWIN Vise-Grip Welding Clamp Pliers",
description: "Serrated jaws hold work pieces in place for welding",
price: 29.99,
categoryId: "welding"
},

// Material Handling Category (25 products)
{
id: "hand-truck-harper",
name: "Harper 700 lb Capacity Hand Truck",
description: "Convertible two-wheel and four-wheel dolly design",
price: 99.99,
categoryId: "material-handling"
},
{
id: "pallet-jack-milwaukee",
name: "Milwaukee 27-Inch x 48-Inch Pallet Jack",
description: "5,000 lb capacity with nylon steer and load wheels",
price: 349.99,
categoryId: "material-handling"
},
{
id: "floor-jack-arcan",
name: "Arcan 2-Ton Ultra-Low Profile Floor Jack",
description: "Reinforced steel frame with smooth hydraulic pump",
price: 99.99,
categoryId: "material-handling"
},
{
id: "wheelbarrow-jackson",
name: "Jackson M6T22 6-Cubic Foot Contractor Wheelbarrow",
description: "Seamless steel tray, 16-inch pneumatic tire",
price: 99.99,
categoryId: "material-handling"
},
{
id: "moving-dolly-steel-core",
name: "Steel Core Furniture Dolly",
description: "1,000 lb capacity with 4-inch swivel casters",
price: 79.99,
categoryId: "material-handling"
},
{
id: "lift-table-wesco",
name: "Wesco Industrial 30 x 18-Inch Hydraulic Lift Table",
description: "600 lb capacity with foot pump and safety prop",
price: 399.99,
categoryId: "material-handling"
},
{
id: "shop-crane-torin",
name: "Torin Big Red 1-Ton Hydraulic Shop Crane",
description: "Adjustable boom height from 37 to 82 inches",
price: 249.99,
categoryId: "material-handling"
},
{
id: "drum-dolly-akoma",
name: "Akoma 55-Gallon Drum Dolly",
description: "Holds one standard 55-gallon drum, 3-inch swivel casters",
price: 79.99,
categoryId: "material-handling"
},
{
id: "pipe-caddy-vestil",
name: "Vestil PIPE-CAD Pipe Caddy",
description: "Portable stand for transporting and storing pipe",
price: 199.99,
categoryId: "material-handling"
},
{
id: "utility-cart-husky",
name: "Husky 3-Shelf Heavy-Duty Utility Cart",
description: "500 lb capacity with 5-inch swivel casters",
price: 129.99,
categoryId: "material-handling"
},

// Painting Tools Category (25 products)
{
id: "paint-sprayer-graco",
name: "Graco Magnum ProX19 Cart Paint Sprayer",
description: "Sprays up to 125 gallons per year, adjustable pressure",
price: 499.99,
categoryId: "painting"
},
{
id: "paint-roller-frame-wooster",
name: "Wooster Sherlock II Pro Grade Roller Frame",
description: "18-inch frame with sturdy steel construction",
price: 19.99,
categoryId: "painting"
},
{
id: "paint-brushes-purdy",
name: "Purdy XL Series Angular Sash Paint Brushes",
description: "Flagged taklon bristles, beveled trim for clean edges",
price: 12.99,
categoryId: "painting"
},
{
id: "paint-tray-husky",
name: "Husky Plastic Paint Tray",
description: "18-inch size with beveled edge and plastic grate",
price: 6.99,
categoryId: "painting"
},
{
id: "paint-scraper-hyde",
name: "Hyde 6-in-1 Painter's Tool",
description: "Scraper, putty knife, paint can opener, and more",
price: 9.99,
categoryId: "painting"
},
{
id: "paint-roller-covers-wooster",
name: "Wooster 9-Inch Mini-Koter Microfiber Roller Covers",
description: "6-pack of 3/8-inch nap covers for smooth surfaces",
price: 24.99,
categoryId: "painting"
},
{
id: "paint-edger-shur-line",
name: "Shur-Line 2006992 Paint Edger Pro",
description: "3-inch edging tool with angled head and soft grip",
price: 14.99,
categoryId: "painting"
},
{
id: "caulk-gun-dewalt",
name: "DEWALT Caulk Gun with 10 oz. Barrel",
description: "Heavy-duty ratchet-style with variable speed control",
price: 24.99,
categoryId: "painting"
},
{
id: "paint-strainer-trimaco",
name: "Trimaco 5-Gallon Paint Strainer",
description: "Reusable fine mesh strainer for paint and stain",
price: 8.99,
categoryId: "painting"
},
{
id: "drop-cloths-trimaco",
name: "Trimaco 9 ft x 12 ft Canvas Drop Cloths, 2-Pack",
description: "100% cotton drop cloths for paint and stain projects",
price: 39.99,
categoryId: "painting"
},

// Fasteners & Hardware Category (25 products)
{
id: "drywall-screws-spax",
name: "SPAX 6 x 1-1/4 Flat Head Drywall Screws, 1 lb Box",
description: "Fine thread phosphate-coated drywall screws",
price: 9.99,
categoryId: "fasteners"
},
{
id: "hex-bolts-hillman",
name: "The Hillman Group Zinc-Plated Hex Bolts, 1/4-20 x 2\"",
description: "Grade 5 hex head bolts, 50-pack",
price: 11.99,
categoryId: "fasteners"
},
{
id: "wood-screws-grip-rite",
name: "GRK R4 #8 x 2\" Fine Thread Bugle-Head Wood Screws, 100-Pack",
description: "Star drive recess, fully threaded for all-purpose use",
price: 19.99,
categoryId: "fasteners"
},
{
id: "concrete-anchors-hilti",
name: "Hilti HIT-HY 200 A Adhesive Anchor, 1/2\" x 5-1/4\"",
description: "Threaded rod for concrete applications, 10-pack",
price: 99.99,
categoryId: "fasteners"
},
{
id: "anchor-bolt-kit-powers",
name: "Powers Fasteners Anchor Bolt Kit, 1/2\" x 3-3/4\"",
description: "Includes 25 wedge anchors, washers, and nuts",
price: 69.99,
categoryId: "fasteners"
},
{
id: "drywall-anchors-toggler",
name: "Toggler Snaptoggle Hollow Wall Anchors, 1/4\"-20, 25-Pack",
description: "Self-drilling anchors for drywall and hollow walls",
price: 19.99,
categoryId: "fasteners"
},
{
id: "rivets-pop",
name: "POP Avdel 1/8\" x 1/2\" Rivets, 100-Pack",
description: "Aluminum blind rivets for metal-to-metal applications",
price: 14.99,
categoryId: "fasteners"
},
{
id: "washers-hillman",
name: "The Hillman Group Stainless Steel Fender Washers, 1/2\"",
description: "18-8 stainless steel, 100-pack, for heavy-duty use",
price: 12.99,
categoryId: "fasteners"
},
{
id: "cable-ties-gardner-bender",
name: "Gardner Bender Nylon Cable Ties, 8-Inch, 100-Pack",
description: "UV-resistant nylon ties for indoor and outdoor use",
price: 9.99,
categoryId: "fasteners"
},
{
id: "epoxy-anchor-adhesive-hilti",
name: "Hilti HIT-RE 500 V3 Epoxy Adhesive Anchor, 10.1 oz Cartridge",
description: "Two-component epoxy for heavy-duty anchoring",
price: 39.99,
categoryId: "fasteners"
},

// Cleaning Equipment Category (25 products)
{
id: "shop-vacuum-dewalt",
name: "DEWALT 6-Gallon Poly Wet/Dry Vacuum",
description: "Powerful 4.25 HP motor with versatile accessories",
price: 129.99,
categoryId: "cleaning"
},
{
id: "pressure-washer-sun-joe",
name: "Sun Joe SPX3000 2030 PSI 1.76 GPM Electric Pressure Washer",
description: "1800-watt motor with five quick-connect spray tips",
price: 199.99,
categoryId: "cleaning"
},
{
id: "floor-buffer-clarke",
name: "Clarke MA10 13-Inch Floor Buffer/Polisher",
description: "1.5 HP motor with dual counter-rotating brushes",
price: 449.99,
categoryId: "cleaning"
},
{
id: "degreaser-zep",
name: "Zep Heavy-Duty Citrus Degreaser, 1-Gallon",
description: "Cuts through grease, oil, and grime effectively",
price: 17.99,
categoryId: "cleaning"
},
{
id: "cleaning-brushes-quickie",
name: "Quickie Scrub Brush with Tampico Bristles",
description: "9-inch hand scrub brush for heavy-duty cleaning",
price: 6.99,
categoryId: "cleaning"
},
{
id: "bucket-wringer-rubbermaid",
name: "Rubbermaid Commercial Mop Bucket and Wringer Combo",
description: "3.5 gallon capacity with built-in wringer",
price: 59.99,
categoryId: "cleaning"
},
{
    id: 'mop-heads-unger',
    name: 'Unger MicroStrip Microfiber Mop Heads, 18-Inch, 2-Pack',
    description: 'Reusable and machine washable microfiber mop heads',
    price: 21.99,
    categoryId: 'cleaning'
    },
    {
    id: 'squeegee-ettore',
    name: 'Ettore 36-Inch Professional Squeegee',
    description: 'Heavy-duty stainless steel frame with replaceable rubber blade',
    price: 22.99,
    categoryId: 'cleaning'
    },
    {
    id: 'scrub-pads-scotch-brite',
    name: '3M Scotch-Brite Heavy-Duty Scrub Pads, 6-Pack',
    description: 'Cut through tough messes on surfaces like stainless steel',
    price: 7.99,
    categoryId: 'cleaning'
    },
    {
    id: 'window-cleaner-sullivans',
    name: 'Sullivans Glass Cleaner, 32 oz Spray Bottle',
    description: 'Ammonia-free formula that leaves windows streak-free',
    price: 4.99,
    categoryId: 'cleaning'
    },
    {
    id: 'trash-bags-husky',
    name: 'Husky 42-Gallon Contractor Trash Bags, 24-Count',
    description: '3 mil thick heavy-duty bags for construction and renovation',
    price: 19.99,
    categoryId: 'cleaning'
    },
    {
    id: 'broom-dust-pan-set-rubbermaid',
    name: 'Rubbermaid Commercial Lobby Pro Upright Broom and Dust Pan Set',
    description: '36-inch broom with 12-inch dust pan for efficient cleaning',
    price: 29.99,
    categoryId: 'cleaning'
    },
    {
    id: 'shop-towels-wypall',
    name: 'WypAll X80 Reusable Cleaning Cloths, 12.5 x 16.8 Inches, 200-Count',
    description: 'Heavy-duty, durable shop towels for industrial use',
    price: 54.99,
    categoryId: 'cleaning'
    },
    {
    id: 'mop-bucket-wringer-combo-carlisle',
    name: 'Carlisle Mopster 8-Gallon Mop Bucket and Wringer Combo',
    description: 'Durable plastic construction with built-in side-press wringer',
    price: 49.99,
    categoryId: 'cleaning'
    },
    {
    id: 'floor-cleaner-zep',
    name: 'Zep All-Purpose Floor Cleaner, 1-Gallon',
    description: 'Concentrated formula for mopping and auto-scrubbing',
    price: 15.99,
    categoryId: 'cleaning'
    },
    {
    id: 'microfiber-mop-kit-rubbermaid',
    name: 'Rubbermaid Reveal Microfiber Floor Mop Cleaning Kit',
    description: 'Includes mop, 2 reusable microfiber pads, and spray bottle',
    price: 39.99,
    categoryId: 'cleaning'
    }
];