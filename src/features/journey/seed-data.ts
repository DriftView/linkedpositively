/**
 * Journey starter content. Category names and the Health "methods" follow
 * the old site's content (docs/legacy/03 §9); the rest is written for this
 * app. The study's own 153 goals arrive with the data migration.
 */
export type SeedJourneyCategory = {
  slug: string;
  name: string;
  description: string;
  accent: "plum" | "magenta" | "sky" | "apricot" | "pink";
  methods: { name: string; goals: string[] }[];
};

export const SEED_JOURNEY: SeedJourneyCategory[] = [
  {
    slug: "health",
    name: "Health",
    description: "Feel strong, informed and in charge of your care.",
    accent: "sky",
    methods: [
      {
        name: "Feel more in control of my own health",
        goals: [
          "Write down three questions before my next appointment",
          "Learn what my latest lab results mean",
          "Keep a list of my medicines and doses on my phone",
        ],
      },
      {
        name: "Feel more confident in managing my health",
        goals: [
          "Take my medicine at the same time every day for two weeks",
          "Set up refill reminders with my pharmacy",
          "Plan what to do if I miss a dose",
        ],
      },
      {
        name: "Have people who support me in taking care of my health",
        goals: [
          "Tell one person I trust about an upcoming appointment",
          "Join a support group, online or in person",
          "Ask a friend to check in with me once a week",
        ],
      },
      {
        name: "Know how to take the best care of my health",
        goals: [
          "Read three Thrive Tips about treatment",
          "Find a clinic near me using Resources",
          "Ask my provider about vaccines I might need",
        ],
      },
      {
        name: "Find ways of staying healthy that I enjoy",
        goals: [
          "Go for a 20-minute walk three times this week",
          "Try one new healthy recipe",
          "Get to bed by the same time five nights in a row",
        ],
      },
    ],
  },
  {
    slug: "happiness",
    name: "Happiness",
    description: "Make room for calm, joy and self-kindness.",
    accent: "apricot",
    methods: [
      {
        name: "Feel calmer day to day",
        goals: ["Try a five-minute breathing exercise every morning", "Take a phone-free hour each evening", "Spend time outside twice this week"],
      },
      {
        name: "Be kinder to myself",
        goals: ["Write down one thing I did well each day", "Say no to one thing that drains me", "Plan a small treat for myself this week"],
      },
      {
        name: "Do more of what I love",
        goals: ["Block an hour for a hobby this weekend", "Make a playlist that lifts my mood", "Try something creative I've never done"],
      },
      {
        name: "Handle stress in healthy ways",
        goals: ["Notice what triggers my stress and write it down", "Swap one stress habit for a healthier one", "Talk to a counselor or therapist"],
      },
      {
        name: "Feel good about who I am",
        goals: ["Share something about me in my profile", "Read a story from someone who inspires me", "Write a note to my future self"],
      },
    ],
  },
  {
    slug: "family",
    name: "Family (including chosen family)",
    description: "Strengthen the relationships that hold you up.",
    accent: "pink",
    methods: [
      {
        name: "Feel closer to my family",
        goals: ["Call or message a family member just to say hi", "Plan a meal or activity together", "Share a good memory with someone I love"],
      },
      {
        name: "Communicate better with the people I live with",
        goals: ["Use an \"I feel\" statement in a hard conversation", "Agree on one house routine together", "Listen without interrupting for a whole conversation"],
      },
      {
        name: "Build my chosen family",
        goals: ["Reach out to someone I'd like to know better", "Join a community group or event", "Thank someone who's been there for me"],
      },
      {
        name: "Set healthy boundaries",
        goals: ["Decide what I'm comfortable sharing and with whom", "Practice saying one boundary out loud", "Take space when I need it, without guilt"],
      },
      {
        name: "Decide if, when and how to share my status",
        goals: ["Read Thrive Tips about disclosure", "Write down the pros and cons of telling someone", "Practice what I'd say with a friend or on the wall"],
      },
    ],
  },
  {
    slug: "friends",
    name: "Friends",
    description: "Find your people and keep them close.",
    accent: "magenta",
    methods: [
      {
        name: "Make new friends",
        goals: ["Comment on three posts on the wall", "Try a group or class with people who share an interest", "Say yes to one invitation"],
      },
      {
        name: "Stay in touch with friends I care about",
        goals: ["Set a reminder to message a friend each week", "Plan a catch-up call or walk", "Send a friend something that made me think of them"],
      },
      {
        name: "Have friends I can count on",
        goals: ["Tell a friend what kind of support helps me", "Ask for help with one small thing", "Offer help to a friend who's going through something"],
      },
      {
        name: "Feel less lonely",
        goals: ["Spend time in a shared space like a library or café", "Join a support group", "Post on the wall about how I'm really doing"],
      },
      {
        name: "Let go of friendships that hurt me",
        goals: ["Notice how I feel after time with each friend", "Spend less time with someone who brings me down", "Talk to someone I trust about it"],
      },
    ],
  },
  {
    slug: "school-work",
    name: "School/Work",
    description: "Move toward the work and learning you want.",
    accent: "plum",
    methods: [
      {
        name: "Find a job I like",
        goals: ["Update my résumé", "Apply to two jobs this week", "Ask someone to practice interview questions with me"],
      },
      {
        name: "Go back to school or learn a new skill",
        goals: ["Look up one program or course that interests me", "Talk to an advisor about financial aid", "Spend 30 minutes learning something new"],
      },
      {
        name: "Feel more confident at work or school",
        goals: ["Set one goal with my manager or teacher", "Ask one question in a meeting or class", "Celebrate a win, however small"],
      },
      {
        name: "Know my rights at work",
        goals: ["Read about workplace protections in the glossary", "Find out what my employer's leave policy is", "Save the contact for a legal aid service in Resources"],
      },
      {
        name: "Balance work or school with my health",
        goals: ["Schedule appointments ahead so they fit my week", "Plan meals and meds around busy days", "Take my breaks"],
      },
    ],
  },
  {
    slug: "sex-love-life",
    name: "Sex & Love Life",
    description: "Enjoy intimacy that feels safe, healthy and true to you.",
    accent: "pink",
    methods: [
      {
        name: "Feel good about sex and dating",
        goals: ["Read Thrive Tips about dating with HIV", "Write down what I want in a partner", "Talk with a friend about dating"],
      },
      {
        name: "Talk openly with partners",
        goals: ["Practice talking about U=U", "Share one need or boundary with my partner", "Ask a partner about their testing and PrEP"],
      },
      {
        name: "Protect my sexual health",
        goals: ["Get tested for STIs this month", "Keep condoms where I can find them", "Find a sexual health clinic using Resources"],
      },
      {
        name: "Build a healthy relationship",
        goals: ["Plan a date that's just for fun", "Notice and name one thing I appreciate about my partner", "Learn the signs of an unhealthy relationship"],
      },
      {
        name: "Feel safe in my relationships",
        goals: ["Save a hotline number in my phone", "Make a safety plan with someone I trust", "Talk to a counselor about what I'm going through"],
      },
    ],
  },
];
