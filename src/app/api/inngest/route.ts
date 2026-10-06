import { serve } from "inngest/next";
import { jobs as adminJobs } from "@/features/admin/jobs";
import { jobs as aiCoachJobs } from "@/features/ai-coach/jobs";
import { jobs as checkinJobs } from "@/features/checkin/jobs";
import { jobs as communityJobs } from "@/features/community/jobs";
import { jobs as gamificationJobs } from "@/features/gamification/jobs";
import { jobs as notificationJobs } from "@/features/notifications/jobs";
import { jobs as peerNavJobs } from "@/features/peer-nav/jobs";
import { jobs as profileJobs } from "@/features/profile/jobs";
import { jobs as reportJobs } from "@/features/reports/jobs";
import { jobs as resourceJobs } from "@/features/resources/jobs";
import { jobs as smsJobs } from "@/features/sms/jobs";
import { jobs as surveyJobs } from "@/features/surveys/jobs";
import { jobs as tipJobs } from "@/features/tips/jobs";
import { jobs as trackerJobs } from "@/features/tracker/jobs";
import { inngest } from "@/server/jobs/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...adminJobs,
    ...aiCoachJobs,
    ...checkinJobs,
    ...communityJobs,
    ...gamificationJobs,
    ...notificationJobs,
    ...peerNavJobs,
    ...profileJobs,
    ...reportJobs,
    ...resourceJobs,
    ...smsJobs,
    ...surveyJobs,
    ...tipJobs,
    ...trackerJobs,
  ],
});
