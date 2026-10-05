/**
 * The Peer Navigation coaching curriculum: 6 scripted sessions, each with a
 * checklist the coach fills in while running the session.
 *
 * Keys (intro_check1, intro_text1, …) are the legacy Drupal form keys, kept so
 * that saved session revisions migrate one-to-one. The serial (1–6) is the
 * stable identity of a session. Source: docs/legacy/05-peer-navigation-ecoach.md §8.
 */

export type ChecklistText = { key: string; label?: string };
export type ChecklistItem = { key: string; label: string; texts: ChecklistText[] };
export type ChecklistSection = { title: string; items: ChecklistItem[] };
export type Worksheet = { title: string; href: string };

export type CurriculumSession = {
  serial: number;
  title: string;
  description: string;
  sections: ChecklistSection[];
  /** Label of the "No" option of the rescheduling question (wording differs per session). */
  rescheduledNoLabel: string;
  worksheets: Worksheet[];
};

/** A checkbox followed by its untitled free-text box (`{stage}_text{n}`). */
function check(stage: string, n: number, label: string): ChecklistItem {
  return { key: `${stage}_check${n}`, label, texts: [{ key: `${stage}_text${n}` }] };
}
/** A checkbox without a text box. */
function checkOnly(stage: string, n: number, label: string): ChecklistItem {
  return { key: `${stage}_check${n}`, label, texts: [] };
}
/** A checkbox followed by titled text boxes. */
function checkWith(stage: string, n: number, label: string, texts: ChecklistText[]): ChecklistItem {
  return { key: `${stage}_check${n}`, label, texts };
}

const HOW_WAS_WEEK = "How was their week?";
const TECH = "Any technical difficulties? Yes/No";
const FEELING = "Check in with participant, how are they feeling?";
const NEXT_SESSION = "Confirm next session date and time";
const SELF_MONITORING = "Encourage participant to use self-monitoring form to help identify feelings/emotions";

export const SESSION_START_KEY = "session_start_time";
export const SESSION_FOOTER = {
  endTime: { key: "general", label: "END TIME" },
  onSchedule: { key: "session", label: "Did this session happen on the original date and time that was scheduled?" },
  rescheduleReason: { key: "session_time", label: "Enter reason for rescheduling" },
  onPhone: { key: "phone", label: "Did the participant complete this session on their phone?" },
  onVideo: { key: "video", label: "Did the participant use video for their session?" },
} as const;
/** Radio values used by the legacy forms. */
export const YES = "1";
export const NO = "2";

export const METHODS_OF_CONTACT = [
  { value: 1, key: "voice", label: "Voice" },
  { value: 2, key: "voicemail", label: "Voicemail" },
  { value: 3, key: "sms", label: "SMS" },
  { value: 4, key: "email", label: "Email" },
] as const;
export type MethodOfContact = (typeof METHODS_OF_CONTACT)[number]["key"];

/**
 * Worksheets shown on each session, as served by the live site (it serves the
 * files by session number). Stakeholders should confirm this mapping for the
 * current curriculum; see docs/legacy/05 §10.1 and §13.
 */
export const WORKSHEETS = {
  PS: { title: "Problem Solving Worksheet", href: "/worksheets/ProblemSolving_fillable.pdf" },
  SHT: { title: "Sexual Health Tracking Worksheet", href: "/worksheets/SexualHealthTracking_fillable.pdf" },
  AC: { title: "Assertive Communication Tool", href: "/worksheets/AssertiveCommunicationTool.pdf" },
  CONSENT: { title: "I Ask for Consent", href: "/worksheets/AskforConsent.pdf" },
  PREP: { title: "PrEP FAQs", href: "/worksheets/PrEPFAQs.pdf" },
  CBT: { title: "Cognitive Behavioral Triangle", href: "/worksheets/CognitiveBehavioralTriangle.pdf" },
  ADC: { title: "Alcohol and Drugs Calendar", href: "/worksheets/AlcoholDrugsCalendar_fillable.pdf" },
} satisfies Record<string, Worksheet>;

export const CURRICULUM: CurriculumSession[] = [
  {
    serial: 1,
    title: "Introduction and Intake",
    description:
      "Welcome to LinkPositively! In the intro session, we will review how to log into the app for our sessions, and how to use the app. We will discuss expectations of participants and the role of the Peer Navigator, and how to contact research staff. We also want to confirm the best ways to reach you. We will go over the topics that we will be covering in our future sessions, as we will walk through the app and features of the app. You can also ask any questions or voice any concerns you have as we go through all of this.",
    rescheduledNoLabel: "No",
    worksheets: [],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          check("intro", 2, "Review expectations of participant and role of Peer Navigator"),
          check("intro", 3, "Go over technology use and limitations"),
          check(
            "intro",
            4,
            "Review topics that will be covered in sessions: Trauma, Emotions, Regulation, Distress Tolerance, Relationship Patterns, Activating Support Systems, Interpersonal Violence, Power and Control, and Medical Mistrust.",
          ),
          checkWith("intro", 5, "TIPS", [
            { key: "intro_text5", label: "Introduce and walk participant through how to access Tips and navigate topics." },
            { key: "intro_text51", label: "Review that they will be getting Tips daily" },
          ]),
          check("intro", 6, "Walk participant through the APP so that they can maximize their use of it"),
          check("intro", 7, "Confirm best ways to contact participant"),
          check("intro", 8, "Confirm that participant knows how to connect with Peer Navigator and other research staff"),
          check("intro", 9, "Ask participant if they have any questions or concerns at this time"),
          check("intro", 10, NEXT_SESSION),
        ],
      },
    ],
  },
  {
    serial: 2,
    title: "Week 1: Trauma and our Emotions",
    description:
      "Welcome to Week 1! Today we are going to do a quick check in and then move into our discussion around emotions. We are going to start by defining trauma, and then discuss how trauma can impact us. Then, we will talk about some great tools for talking about our feelings and emotions. We will talk about the role of emotions in our lives, how we learned about emotions and identify how we deal with them.",
    rescheduledNoLabel: "No",
    worksheets: [],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          check("intro", 2, "Do they have any questions since baseline? Yes/No"),
          check("intro", 3, "How are they feeling about starting the session?"),
          check("intro", 4, TECH),
          checkOnly(
            "intro",
            5,
            "Set Agenda by identifying goal of this session to discuss trauma, its impacts on emotions, emotion identification, the role of our emotions and other life concerns (syndemic issues)",
          ),
        ],
      },
      {
        title: "Introduce concept of trauma",
        items: [
          check("engaging", 1, "Give definition of Trauma"),
          check("engaging", 2, "Psychoeducation about the Impact of Trauma"),
        ],
      },
      {
        title: "Emotions and Feelings",
        items: [
          check("evoking", 1, "Psychoeducation about the Functions of Emotions"),
          check("evoking", 2, "Psychoeducation about the Influence of Social Environment on Feelings"),
          check(
            "evoking",
            3,
            "Introduce and discuss with participant how to Label Feelings, use feelings wheel and feelings list with participant.",
          ),
          check("evoking", 4, "Introduce and go over self-monitoring form with participant."),
        ],
      },
      {
        title: "Focused Breathing",
        items: [
          check("planning", 1, "Introduce the concept of Focused Breathing and rationale behind using this tool."),
          check(
            "planning",
            2,
            "Walk participant through exercise by explaining how to do this diaphragmatic breathing exercise",
          ),
          check("planning", 3, "Do the exercise for 5 minutes with the participant"),
        ],
      },
      {
        title: "Closing of Session",
        items: [
          check("summary", 1, FEELING),
          check(
            "summary",
            2,
            "Assign breathing exercises – Participant to do them twice a day for 5 minutes each time. Ask if they have any questions",
          ),
          checkOnly("summary", 3, SELF_MONITORING),
          check("summary", 4, NEXT_SESSION),
        ],
      },
    ],
  },
  {
    serial: 3,
    title: "Week 2: Cultivating emotional regulation and distress tolerance",
    description:
      "Welcome to Week 2! We will start today with a check in to see how you are doing and if you have any questions around the discussion of emotions from last week. Today we are going to learn about regulating the emotions and feelings that we are learning to label. We will talk about how our emotions impact us in different ways, the importance of distress tolerance and get some tools to help us cope.",
    rescheduledNoLabel: "No",
    worksheets: [WORKSHEETS.PS, WORKSHEETS.SHT],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          checkWith("intro", 2, "Review session work", [
            { key: "intro_text2", label: "Listen carefully to any problems that they had with the breathing exercises" },
            { key: "intro_text21", label: "Review self-monitoring form. Were they able to use it?" },
          ]),
          check("intro", 3, TECH),
          checkOnly(
            "intro",
            4,
            "Set Agenda by identifying goal of this session is to introduce and discuss emotion regulation and distress tolerance",
          ),
        ],
      },
      {
        title: "Emotion Regulation",
        items: [
          check("engaging", 1, "Psychoeducation about Emotion Regulation"),
          check("engaging", 2, "Identify participants current coping skills"),
          check("engaging", 3, "Describe 3 channels of emotional experience"),
          check("engaging", 4, "Psychoeducation on Healthy Emotional Regulation"),
          check("engaging", 5, "Walk participant through Unhealthy Coping Common to Trauma Survivors"),
        ],
      },
      {
        title: "Distress Tolerance",
        items: [
          check("evoking", 1, "Rationale for Distress Tolerance"),
          check("evoking", 2, "Psychoeducation on Why Tolerate Unpleasant Emotions in Our Lives"),
          check("evoking", 3, "Psychoeducation on how to know whether to tolerate the unpleasant emotions or not"),
        ],
      },
      {
        title: "Tools to help with Emotion Regulation and Distress Tolerance",
        items: [
          check("planning", 1, "Introduce Assessing Pros and Cons"),
          check("planning", 2, "Introduce Emotion Surfing"),
          check("planning", 3, "Pleasurable Activities"),
          check("planning", 4, "Positive Self-statements"),
          check("planning", 5, "The Gift of a Pause/Formal Time-Out"),
        ],
      },
      {
        title: "Closing of Session",
        items: [
          check("summary", 1, FEELING),
          check(
            "summary",
            2,
            "Review and assign breathing exercises – Participant to do them twice a day for 5 minutes each time.",
          ),
          check("summary", 3, SELF_MONITORING),
          check("summary", 4, "Practice assessing Pros and Cons of distressing situations during the week"),
          check("summary", 5, "Engage in 1 pleasurable activity during the week"),
          check("summary", 6, "Engage in 1 positive self-statement per day"),
          check("summary", 7, "Review and implement if possible, The Gift of a Pause"),
          check("summary", 8, NEXT_SESSION),
        ],
      },
    ],
  },
  {
    serial: 4,
    title: "Week 3: Relationships: Relationship patterns and activating social support networks",
    description:
      "Welcome to Week 3! In this session we are going to start with our check in, and answer any questions or concerns that you may have around what we have covered so far. Then, we will talk about personal relationship patterns. We will explore patterns that we have in our relationships and how to establish healthy boundaries and communicate assertively, and then we will review our basic personal rights.",
    rescheduledNoLabel: "No",
    worksheets: [WORKSHEETS.AC, WORKSHEETS.CONSENT, WORKSHEETS.SHT],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          checkWith("intro", 2, "Review session work", [
            { key: "intro_text2", label: "How was the breathing exercise?" },
            { key: "intro_text21", label: "Do they have anything on the feelings monitoring form they want to share or process?" },
            { key: "intro_text22", label: "Did they engage in a pleasurable activity?" },
            { key: "intro_text23", label: "What positive self-statement(s) did they use?" },
            { key: "intro_text24", label: "Were they able to practice Pros and Cons of tolerating a distressing situation?" },
            { key: "intro_text25", label: "Were they able to review The Gift of a Pause?" },
          ]),
          check("intro", 3, TECH),
          checkOnly(
            "intro",
            4,
            "Set Agenda by identifying goal of this session is to introduce and discuss Relationship Patterns, Agency and Assertiveness in Relationships, and Flexibility in relationships",
          ),
        ],
      },
      {
        title: "Identifying Personal Relationship Patterns",
        items: [
          check("evoking", 1, "Psychoeducation on Interpersonal Schemas and self-fulfilling prophecy"),
          check("evoking", 2, "How to Identify your Interpersonal Schemas"),
          check("evoking", 3, "Common Interpersonal Schemas"),
        ],
      },
      {
        title: "Agency and Assertiveness in Relationships",
        items: [
          check("planning", 1, "Psychoeducation about Effective Assertiveness"),
          check("planning", 2, "Psychoeducation about Boundaries in Relationships"),
          check("planning", 3, 'Introduce "I" Messages'),
          check("planning", 4, "Basic Personal Rights"),
        ],
      },
      {
        title: "Closing of Session",
        items: [
          check("summary", 1, FEELING),
          check("summary", 2, "Review and assign breathing exercises – Participant to do them 2x's a day for 5 min"),
          check("summary", 3, SELF_MONITORING),
          check("summary", 4, "Practice assessing Pros and Cons of distressing situations during the week"),
          check("summary", 5, "Engage in self-care: 1 pleasurable activity and 1 positive self-statement per day"),
          check("summary", 6, "Review The Gift of a Pause and Basic Personal Rights"),
          check("summary", 7, 'Practice "I" statements'),
          check("summary", 8, NEXT_SESSION),
        ],
      },
    ],
  },
  {
    serial: 5,
    title: "Week 4: Interpersonal Violence: Its impact on how we navigate the world around us",
    description:
      "Welcome to Week 4! Today we are going to start with our check in. We will take time to see how you are doing with all the tools and topics that we have covered so far. We will then move into discussing interpersonal violence. This can be a challenging topic, but we are here to support you and we can move at a pace you are comfortable with. We are going to begin by talking about the power and control in interpersonal relationships. We will explore the impact that interpersonal violence and trauma can have on all areas of our lives. We will look at flexibility in relationships that we have and talk about the different types of power that exist, like boss and employee. We will also talk about different tools on how to navigate these relationships.",
    rescheduledNoLabel: "No",
    worksheets: [WORKSHEETS.PREP, WORKSHEETS.SHT],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          checkWith("intro", 2, "Review session work", [
            { key: "intro_text2", label: "How was the breathing exercise?" },
            { key: "intro_text21", label: "Do they have anything on the feelings monitoring form they want to share or process?" },
            { key: "intro_text22", label: "Did they engage in a pleasurable activity?" },
            {
              key: "intro_text23",
              label:
                "What positive self-statement(s) did they use? Were they able to practice Pros and Cons of tolerating a distressing situation?",
            },
            { key: "intro_text24", label: "Were they able to review The Gift of a Pause?" },
            { key: "intro_text25", label: 'Did they practice "I" statements?' },
            { key: "intro_text26", label: "Did they review the Personal Bill of Rights?" },
          ]),
          check("intro", 3, TECH),
          checkOnly(
            "intro",
            4,
            "Set Agenda by identifying goal of this session discuss Power and Control Dynamics, creating healthy relationships and using all these new tools to help them navigate the world around them.",
          ),
        ],
      },
      {
        title: "Power and Control Dynamics",
        items: [
          check(
            "engaging",
            1,
            "Psychoeducation about Interpersonal Violence. Use Cycle of Violence handout to guide conversation.",
          ),
          check(
            "engaging",
            2,
            "Psychoeducation about power and control in interpersonal relationships using Power and Control wheel to guide conversation",
          ),
          check(
            "engaging",
            3,
            "Psychoeducation on impact of Interpersonal violence and trauma on all areas in our lives (socio-structural barriers)",
          ),
        ],
      },
      {
        title: "Flexibility in Relationships",
        items: [
          check("evoking", 1, "Psychoeducation about Different Types of Power Differentials"),
          check("evoking", 2, "Psychoeducation about Respect and Compassion"),
          check("evoking", 3, 'Effective ways of saying "No"'),
          check("evoking", 4, "Effective ways of Making Requests"),
          check("evoking", 5, "Compassion: Practicing Living More Easily with Yourself and Others"),
        ],
      },
      {
        title: "Closing of Session",
        items: [
          check("summary", 1, FEELING),
          check("summary", 2, "Review and assign breathing exercises – Participant to do them 2x's a day for 5 min"),
          check("summary", 3, SELF_MONITORING),
          check("summary", 4, "Practice assessing Pros and Cons of distressing situations during the week"),
          check("summary", 5, "Engage in self-care: 1 pleasurable activity and 1 positive self-statement per day"),
          check("summary", 6, "Review The Gift of a Pause and Basic Personal Rights"),
          check("summary", 7, 'Practice "I" statements'),
          check("summary", 8, 'Review and practice saying "no"'),
          check("summary", 9, "Practice making requests"),
          check("summary", 10, NEXT_SESSION),
        ],
      },
    ],
  },
  {
    serial: 6,
    title: "Week 5: Medical Mistrust and Review",
    description:
      "Congratulations! We are here at week 5! We are going to start by checking in, answering any questions or concerns that you have, and then going over the tools that you have been practicing. Today, we are going to cover the topic of medical mistrust. We will look at the relationship between discrimination and medical mistrust. We will explore some HIV beliefs and look at what is true and what is false. We will identify skills for building patient-provider communication. We will finish today's session by reviewing all the tools that you now have in your back pocket and how to use them to navigate the world around you.",
    rescheduledNoLabel: "No (If not, why was the session rescheduled?)",
    worksheets: [WORKSHEETS.CBT],
    sections: [
      {
        title: "Check in with participant:",
        items: [
          check("intro", 1, HOW_WAS_WEEK),
          checkWith("intro", 2, "Review session work", [
            { key: "intro_text2", label: "How was the breathing exercise?" },
            { key: "intro_text21", label: "Do they have anything on the feelings monitoring form they want to share or process?" },
            { key: "intro_text22", label: "Did they engage in a pleasurable activity?" },
            {
              key: "intro_text23",
              label:
                "What positive self-statement(s) did they use? Were they able to practice Pros and Cons of tolerating a distressing situation?",
            },
            { key: "intro_text24", label: "Were they able to review The Gift of a Pause?" },
            { key: "intro_text25", label: 'Did they practice "I" statements?' },
            { key: "intro_text26", label: "Did they review the Personal Bill of Rights?" },
            { key: "intro_text27", label: 'Were they able to practice saying "No"?' },
            { key: "intro_text28", label: "Did they practice making requests?" },
          ]),
          check("intro", 3, TECH),
          checkOnly(
            "intro",
            4,
            "Set Agenda by identifying goal of this session is to discuss Medical Mistrust and Distrust. Identify tools to help navigate medical needs in their life. Address facts around current HIV treatment options. Finally Review all tools gained from sessions and address questions.",
          ),
        ],
      },
      {
        title: "Medical Mistrust",
        items: [
          checkWith("engaging", 1, "Psychoeducation on medical mistrust", [
            { key: "engaging_text1", label: "Definition of medical mistrust" },
            { key: "engaging_text11", label: "Relationship between discrimination and medical mistrust" },
          ]),
          check(
            "engaging",
            2,
            "Provide example(s) of medical mistrust and get personal experiences/examples from participant.",
          ),
          check("engaging", 3, "Psychoeducation on HIV conspiracy beliefs – what is true and what is false"),
          check("engaging", 4, "Skills building for effective patient-provider communication"),
        ],
      },
      {
        title: "Review Tools and Tie them into how they help to Navigate the World Around Them",
        items: [
          check("evoking", 1, "Breathing exercises – how to use and benefits"),
          check("evoking", 2, "Feelings Monitoring Form"),
          check("evoking", 3, "Pros and Cons – Relate to challenges specific to participant (e.g., medical mistrust)"),
          check("evoking", 4, "The Gift of a Pause"),
          check("evoking", 5, "Emotion Surfing"),
          check("evoking", 6, "Pleasurable Activities"),
          check("evoking", 7, "Positive Self-Statements"),
          check("evoking", 8, '"I" Statements'),
          check("evoking", 9, "Cycle of violence"),
          check("evoking", 10, "Power and control wheel"),
          check("evoking", 11, 'Saying "No"'),
          check("evoking", 12, "Making effective requests"),
          check("evoking", 13, "Practicing compassion"),
          check("evoking", 14, "Personal Bill of Right"),
          // The legacy form stored this item's text under evoking_text17.
          checkWith("evoking", 15, "Effective patient-provider communication", [{ key: "evoking_text17" }]),
        ],
      },
      {
        title: "Closing of Session",
        items: [
          checkOnly("summary", 1, "Congratulate participant on all the hard work that they have done"),
          check("summary", 2, "Ask if they have any questions or concerns"),
          check("summary", 3, "Connect them to resource guide and tips"),
          check(
            "summary",
            4,
            "Remind participant that they will be contacted by Research Coordinator or Research Associate to schedule their Follow Up questionnaire/survey",
          ),
        ],
      },
    ],
  },
];

export const SESSION_COUNT = CURRICULUM.length;

export function getCurriculumSession(serial: number) {
  return CURRICULUM.find((session) => session.serial === serial);
}

/** Every answer key a session's form can hold, for validation and CSV export. */
export function sessionAnswerKeys(session: CurriculumSession) {
  const keys: string[] = [SESSION_START_KEY];
  for (const section of session.sections) {
    for (const item of section.items) {
      keys.push(item.key, ...item.texts.map((text) => text.key));
    }
  }
  keys.push(...Object.values(SESSION_FOOTER).map((field) => field.key));
  return keys;
}
