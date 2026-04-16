import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureTemplate({
    name,
    description,
    questions,
    createdById,
}: {
    name: string;
    description: string;
    questions: string[];
    createdById: string;
}) {
    const existing = await prisma.interviewTemplate.findFirst({
        where: { name },
        select: { id: true },
    });

    if (existing) {
        return prisma.interviewTemplate.update({
            where: { id: existing.id },
            data: {
                description,
                questions: JSON.stringify(questions),
            },
        });
    }

    return prisma.interviewTemplate.create({
        data: {
            name,
            description,
            questions: JSON.stringify(questions),
            createdById,
        },
    });
}

async function main() {
    const demoUserId = "dev-user-local";
    await prisma.appSetting.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, cvRetentionDays: 30 },
    });

    await prisma.user.upsert({
        where: { id: demoUserId },
        update: {
            name: "Demo Admin",
            email: "dev@herdhunter.local",
            role: "ADMIN_INTERVIEWER",
        },
        create: {
            id: demoUserId,
            name: "Demo Admin",
            email: "dev@herdhunter.local",
            role: "ADMIN_INTERVIEWER",
        },
    });

    const professions = ["Engineering", "TA", "QA", "Data", "User Research", "UX", "BA", "PL", "Delivery", "People"];
    await prisma.candidate.updateMany({
        where: { profession: { is: { name: { notIn: professions } } } },
        data: { professionId: null },
    });
    await prisma.profession.deleteMany({
        where: { name: { notIn: professions } },
    });
    for (const name of professions) {
        await prisma.profession.upsert({ where: { name }, update: {}, create: { name } });
    }

    await prisma.interviewTemplate.deleteMany({
        where: { name: "Engineering Pre-Interview Question" },
    });

    const preInterviewIntro = "Send at least 24 hours before the interview. Spend no more than 30 minutes preparing your approach. We are not looking for a fully formed answer or polished presentation. The candidate should share their screen during the interview, so they should join on a computer rather than a phone or tablet.";

    await ensureTemplate({
        name: "Engineering Pre-Interview: Event-Driven Cloud",
        description: preInterviewIntro,
        createdById: demoUserId,
        questions: [
            `An event is received which contains 100 data lines.

The data must be sent, with an "INSERT" instruction, line by line to 2 REST endpoints with the following caveats:
- If a single line fails to be sent, then no further events should be processed.
- The 1st REST endpoint must receive the data before it is sent to the 2nd endpoint.
- If any data fails to send, then a "DELETE" instruction must be sent to the same endpoint for each of the inserted lines.

How would you handle the event arriving at an API on a cloud provider?`,
        ],
    });

    await ensureTemplate({
        name: "Engineering Pre-Interview: Batch Processing",
        description: preInterviewIntro,
        createdById: demoUserId,
        questions: [
            `You have a batch job that processes customer financial transactions nightly and posts summaries to an external API. Halfway through, the external API goes down.

What design choices would you make so that the job can be retried safely without double-posting or losing data?

Constraints:
- Double-posting would result in a customer being charged twice.
- Losing a record would result in a customer not being charged.
- Changing the external API is prohibitively expensive.`,
        ],
    });

    await ensureTemplate({
        name: "Engineering Pre-Interview: Road Pricing",
        description: preInterviewIntro,
        createdById: demoUserId,
        questions: [
            `The Department for Transport is planning to deliver a new system for a per-mile road pricing scheme for the UK. Car owners will receive a bill each year based on the number of miles driven. This will replace the car tax system currently in place.

How would you approach this project? Assume the platform is a cloud provider.`,
        ],
    });

    await ensureTemplate({
        name: "Engineering Skills Interview",
        description: "50 minute interview in a 60 minute slot. Typical threshold is 65+ to progress. Capture notes and scores by section, and use Gemini transcription where the candidate agrees.",
        createdById: demoUserId,
        questions: [
            `Part 1: Introduction (5 mins, not scored)
- Introduce yourselves.
- Discuss Herdhunter and the role. Confirm the candidate understands the role and working context.
- Explain that this interview focuses on engineering profession-specific skills.
- Invite the candidate to ask clarifying questions at any point.
- Explain you will be taking notes and ask whether they are happy for Gemini transcription to be used.
- Ask what attracted them to Herdhunter.

Positive indicators:
- Engaged and friendly.
- Understands this is consultancy work.
- Has done some research.

Negative indicators:
- Not engaged.
- Does not understand the business.
- Poor communication or rapport.`,
            `Part 2: CV review / icebreaker (5 mins, not scored)
Ask the candidate to describe the last 2 to 3 years of their work and follow up on any important points.

Positive indicators:
- Good breadth of relevant experience.
- Can back up the CV with detail.

Negative indicators:
- Cannot expand on the CV.
- Lack of relevant experience or depth.`,
            `Part 3: Technical question icebreaker (10 mins, score /10)
Use the appropriate slide deck for the role and language. You do not need to cover every question, but keep to time.

Positive indicators:
- Appropriate level of language knowledge.
- Explains clearly using precise technical language.
- Needs limited prompting.

Negative indicators:
- Not familiar with the code or language.
- Imprecise explanations.
- Needs heavy prompting.`,
            `Part 4: Main technical question (15 mins, score /60)
The candidate should have received a pre-interview question in advance. Work through it collaboratively. We are assessing thought process, approach, and technical ability rather than a polished presentation.

General prompts:
- How did you approach the question? If AI was used, they should say so.
- What do you understand to be the requirements and constraints?
- What cloud services would you use?
- What implementation issues might you encounter?
- How would you ensure the system design is secure?

Road pricing follow-up prompts:
- How would mileage data be sent to the DfT? Prompt: think about MOTs.
- How would you structure the database?
- How would yearly bills be issued and payment taken?

Assessment guidance:
- Score against the exemplar answer for the chosen scenario and the target level.
- Note where the candidate is operating below or above expected level.`,
            `Part 5A: Discipline / skills - ways of working (score /10)
Suggested questions:
- How do you ensure code quality?
- What is your process for doing a code review?
- How do you approach test coverage?
- How do you approach learning a new language?
- What does a good CI/CD pipeline look like?
- When investigating bugs, is it most important to implement a quick fix or find the root cause?

Positive indicators:
- Strong SDLC knowledge.
- Sensible problem-solving approach.
- Clear willingness to learn.

Negative indicators:
- Weak fundamentals.
- Requires heavy prompting.
- Unclear problem-solving approach.`,
            `Part 5B: Cloud questions - AWS / Azure (score /10)
Suggested questions:
- What problems might you get with Lambda / Azure Function cold starts?
- Do you have a favourite AWS service / Azure resource?
- Is it possible to keep up to date with every change to the cloud?
- Have you used Infrastructure as Code?
- What are the benefits of IaC?
- What is the best way to deploy a new service: serverless, containers, or another approach?
- What are some challenges about testing in a cloud environment?

Positive indicators:
- Good knowledge of at least one cloud platform.
- Willingness to continue learning or pursue certs.

Negative indicators:
- Lack of familiarity with cloud services.
- Little depth in answers.`,
            `Part 5C: General skill-based questions (score /10)
Suggested questions:
- What is your favourite package in the language you use?
- How do you keep up to date with your language, tooling, and testing approaches?
- What gives you a sense of accomplishment?
- What is the definition of a successful project?
- What do you consider to be bad coding or testing practice?

Positive indicators:
- Strong professional enthusiasm.
- Demonstrates curiosity and pride in craft.

Negative indicators:
- Low interest in the profession.
- Weak reflection on engineering practice.`,
            `Part 5D: AI questions (score /10)
Suggested questions:
- How could AI be used to enhance the solution or accelerate delivery of a project? Do you have an example?
- Prompt if needed: a client requires a system where users upload audio files to a website and the site suggests answers to a questionnaire based on the recording.
- What ethical concerns might there be with your approach?

Positive indicators:
- Balanced understanding of AI capabilities and limitations.
- Aware of ethical, delivery, and client concerns.

Negative indicators:
- Entirely negative or uncritical view of AI.
- No understanding of AI technologies or ethical considerations.`,
            `Part 6: Candidate questions and close (not scored)
- Invite candidate questions.
- Thank them and explain they will hear back shortly.
- Capture any useful notes on what they asked and how they closed out the interview.

Overall scoring guidance:
- Total score out of 100.
- Typical threshold to progress is 65+.
- Record indicative level in band if successful: N/A, Low, Medium, or High.
- Record recommendation: unsuccessful, yes at different level, or proceed to next round.
- Record development feedback suitable to share with the candidate.`,
        ],
    });

    const positions = [
        {
            id: "senior-software-engineer-seed",
            title: "Senior Software Engineer",
            team: "Engineering",
            level: "Senior",
            targetHires: 1,
            hiringLead: "Adam E / James H",
            interviewLead: "Robert C / Alex M",
        },
        {
            id: "principal-software-engineer-seed",
            title: "Principal Software Engineer",
            team: "Engineering",
            level: "Principal",
            targetHires: 1,
            hiringLead: "Mike / Tom / Dapherz",
            interviewLead: "Robert C / Alex M",
        },
    ];

    for (const position of positions) {
        await prisma.openPosition.upsert({
            where: { id: position.id },
            update: {
                title: position.title,
                team: position.team,
                level: position.level,
                targetHires: position.targetHires,
                hiringLead: position.hiringLead,
                interviewLead: position.interviewLead,
            },
            create: position,
        });
    }

    console.log("Seeded app settings, professions, open positions, and interview templates:", professions.join(", "));
}

main().catch(console.error).finally(() => prisma.$disconnect());
