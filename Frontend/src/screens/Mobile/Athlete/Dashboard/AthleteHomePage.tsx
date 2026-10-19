import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import styles from "./styles/AthleteHomePage";
import { HomeAnalyticsPage, AthleteProfile, EligibleDocument } from "./HomeAnalyticsPage";
import { AthleteProfilePage } from "../Profile/AthleteProfilePage";
import { NotificationPage, NotificationItem } from "./Notification";
import { Teams } from "../Teams/Teams";
import { TeamProfileScreen } from "./TeamProfile";
import { CoachProfileScreen } from "./CoachProfile";
import { requestAuthenticatedJson } from "../../Authentication/authShared";
import { AthleteHomePageSkeleton } from "./AthleteSkeletons";
import { getAthleteProfileOfflineFirst, db } from "../../../../services/firebaseClient";
import { doc, setDoc, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AtletaAnimatedLogo } from "../../../../components/AtletaAnimatedLogo";

const OFFLINE_ATHLETE_PROFILE_CACHE_KEY = "atleta_offline_athlete_profile_cache";

const DEFAULT_ELIGIBLE_DOCS: EligibleDocument[] = [];

// Athlete Data Structure
export const initialAthleteProfile: AthleteProfile = {
  athlete_id: "",
  first_name: "",
  last_name: "",
  birthdate: "",
  gender: "MALE",
  province: "",
  category: "BASKETBALL",
  height_cm: 0,
  weight_kg: 0,
  wingspan_cm: 0,
  current_affiliation: {
    team_id: "",
    team_name: "Unassigned Team",
    sport_type: "BASKETBALL",
    division: "",
    head_coach: {
      coach_id: "",
      full_name: "No Coach Assigned",
      role_title: "Head Coach",
      years_experience: "0 Years",
      quote: "",
    },
    is_verified: false,
  },
  analytics: {
    points_per_game: 0,
    assists_per_game: 0,
    rebounds_per_game: 0,
    field_goal_percentage: 0,
    free_throw_percentage: 0,
    last_5_games_scores: [],
    best_time_formatted: "00.00s",
    split_time_formatted: "00.00s",
    total_distance_m: 0,
    lap_count: 0,
    turn_efficiency_pct: 0,
    stroke_efficiency_pct: 0,
    recent_swim_times: [],
    top_sprint_formatted: "00.00s",
    top_distance_m: 0,
    average_pace: "0:00",
    recent_track_marks: [],
  },
  eligible_documents: [],
};

type TabType = "HOME" | "COACHES" | "PROFILE";

interface AthleteHomePageProps {
  onLogout?: () => void;
}

export function AthleteHomePage({ onLogout }: AthleteHomePageProps) {
  const [activeTab, setActiveTab] = useState<TabType>("HOME");
  const [dashboardScreen, setDashboardScreen] = useState<
    "HOME_MAIN" | "TEAM_PROFILE" | "COACH_PROFILE"
  >("HOME_MAIN");
  const [selectedCoachId, setSelectedCoachId] = useState<string | undefined>(undefined);
  const [profile, setProfile] = useState<AthleteProfile>(initialAthleteProfile);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hideParentBars, setHideParentBars] = useState(false);

  useEffect(() => {
    if (activeTab !== "HOME") {
      setDashboardScreen("HOME_MAIN");
    }
    if (activeTab !== "COACHES" && dashboardScreen === "HOME_MAIN") {
      setHideParentBars(false);
    }
  }, [activeTab, dashboardScreen]);

  const refreshAthleteData = useCallback(async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      }
      const [homeRes, profileRes, statsRes, workloadRes, notifRes, inqRes, teamRes]: [any, any, any, any, any, any, any] = await Promise.all([
        requestAuthenticatedJson("/athletes/home").catch(() => null),
        requestAuthenticatedJson("/athletes/profile").catch(() => null),
        requestAuthenticatedJson("/athletes/stats/all").catch(() => null),
        requestAuthenticatedJson("/athletes/workload").catch(() => null),
        requestAuthenticatedJson("/notifications").catch(() => null),
        requestAuthenticatedJson("/inquiries").catch(() => null),
        requestAuthenticatedJson("/athletes/team").catch(() => null),
      ]);

      let homeData = homeRes;
      if (!homeData) {
        homeData = await getAthleteProfileOfflineFirst();
      }

      if (homeData || profileRes || statsRes || workloadRes || teamRes) {
        const raw = {
          ...(profileRes || {}),
          ...(homeData || {}),
          ...(statsRes || {}),
          stats: {
            ...(homeData?.stats || {}),
            ...(profileRes?.stats || {}),
            ...(statsRes?.stats || {}),
          },
          averages: {
            ...(homeData?.averages || {}),
            ...(profileRes?.averages || {}),
            ...(statsRes?.career_averages || {}),
          },
        };
        const stats = raw.stats || raw.analytics || raw;
        const phys = raw.physical_attributes || raw.physical_profile || raw;

        let finalWorkloadRes: any = workloadRes;
        if (!finalWorkloadRes || (!finalWorkloadRes.recent_entries?.length && !finalWorkloadRes.weekly_logs?.length)) {
          const targetId = raw.athlete_id || raw.user_id || raw.user?.uid;
          if (targetId) {
            const specificWl: any = await requestAuthenticatedJson(`/athletes/${targetId}/workload`).catch(() => null);
            if (specificWl && (specificWl.recent_entries?.length > 0 || specificWl.weekly_logs?.length > 0)) {
              finalWorkloadRes = specificWl;
            }
          }
        }

        const rawWorkload: any = (finalWorkloadRes && (finalWorkloadRes.recent_entries?.length > 0 || finalWorkloadRes.weekly_logs?.length > 0))
          ? finalWorkloadRes
          : (profileRes?.workload_analytics || profileRes?.workload || homeRes?.workload_summary || homeRes?.workload || finalWorkloadRes || {});
        
        const entriesList = rawWorkload.recent_entries || rawWorkload.weekly_logs || [];
        
        // Group multiple workout logs on the same date: sum total minutes, keep max intensity
        const groupedByDateMap = new Map<string, { date: string; duration_minutes: number; srpe: number }>();

        if (Array.isArray(entriesList)) {
          entriesList.forEach((entry: any) => {
            const dateStr = entry.entry_date ? String(entry.entry_date).slice(5) : (entry.date || "DAY");
            const duration = Number(entry.session_duration_mins || entry.duration_minutes || 0);
            const intensity = Number(entry.srpe_score || entry.srpe || 0);

            if (groupedByDateMap.has(dateStr)) {
              const existing = groupedByDateMap.get(dateStr)!;
              existing.duration_minutes += duration;
              existing.srpe = Math.max(existing.srpe, intensity);
            } else {
              groupedByDateMap.set(dateStr, {
                date: dateStr,
                duration_minutes: duration,
                srpe: intensity,
              });
            }
          });
        }

        const weeklyLogsGrouped = Array.from(groupedByDateMap.values()).slice(0, 7);

        const workloadAnalyticsObj = {
          acute_load_7day_avg: rawWorkload.acute_load_7d || rawWorkload.acute_load || rawWorkload.acute_load_7day_avg || 0,
          chronic_load_28day_avg: rawWorkload.chronic_load_28d || rawWorkload.chronic_load || rawWorkload.chronic_load_28day_avg || 380,
          weekly_logs: weeklyLogsGrouped,
        };

        const sportCategory = (raw.sport_category || raw.sport_type || raw.category || raw.sport || "BASKETBALL").toUpperCase();
        const isSwim = sportCategory.includes("SWIM");
        const isTrack = sportCategory.includes("TRACK") || sportCategory.includes("FIELD");

        let finishTime = "00.00s";
        if (stats.best_time_formatted) finishTime = String(stats.best_time_formatted);
        else if (stats.finish_time_ms) finishTime = `${(Number(stats.finish_time_ms) / 1000).toFixed(2)}s`;
        else if (stats.best_time) finishTime = `${stats.best_time}s`;
        else if (stats.finish_time) finishTime = `${stats.finish_time}s`;

        let splitTime = "00.00s";
        if (stats.split_time_formatted) splitTime = String(stats.split_time_formatted);
        else if (stats.split_times_ms) splitTime = `${(Number(stats.split_times_ms) / 1000).toFixed(2)}s`;
        else if (stats.split_time) splitTime = `${stats.split_time}s`;

        let sprintTime = "00.00s";
        if (stats.top_sprint_formatted) sprintTime = String(stats.top_sprint_formatted);
        else if (stats.finish_time_ms) sprintTime = `${(Number(stats.finish_time_ms) / 1000).toFixed(2)}s`;
        else if (stats.top_sprint_time) sprintTime = `${stats.top_sprint_time}s`;
        else if (stats.best_time) sprintTime = `${stats.best_time}s`;

        const swimDist = Number(stats.total_distance_m ?? stats.distance_meters ?? stats.distance ?? stats.total_distance ?? 0);
        const trackDist = Number(stats.top_distance_m ?? stats.distance_meters ?? stats.distance ?? 0);
        let pace = "0:00";
        if (stats.average_pace) pace = String(stats.average_pace);
        else if (stats.split_times_ms) pace = `${(Number(stats.split_times_ms) / 1000).toFixed(2)}s`;
        else if (stats.pace) pace = String(stats.pace);

        const turnEff = Number(stats.turn_efficiency_pct ?? stats.turn_efficiency ?? stats.efficiency ?? stats.fg_pct ?? 0);
        const strokeEff = Number(stats.stroke_efficiency_pct ?? stats.stroke_efficiency ?? stats.consistency ?? stats.ft_pct ?? 0);
        const swimHistory = stats.recent_swim_times || stats.recent_times || stats.last_races || stats.last_5_games_scores || [];
        const trackHistory = stats.recent_track_marks || stats.recent_marks || stats.last_events || stats.last_5_games_scores || [];

        const teamObj = teamRes?.team || {};
        const coachObj = teamRes?.coach || {};
        let docList = (raw.eligible_documents && raw.eligible_documents.length > 0)
          ? raw.eligible_documents
          : (raw.documents && raw.documents.length > 0)
            ? raw.documents
            : [];

        const targetId = raw.athlete_id || raw.user_id || raw.id;
        const cleanId = targetId ? String(targetId).replace(/^ath_/, "") : "";

        // Check local AsyncStorage cache for uploaded documents first
        if (cleanId) {
          try {
            const cachedDocsRaw = await AsyncStorage.getItem(`atleta_offline_eligible_docs_${cleanId}`);
            if (cachedDocsRaw) {
              const parsedDocs = JSON.parse(cachedDocsRaw);
              if (Array.isArray(parsedDocs) && parsedDocs.length > 0) {
                docList = parsedDocs;
              }
            }
          } catch (_) {}
        }

        let dData: any = null;
        let uData: any = null;
        if (cleanId) {
          try {
            const [d1, d2, uDocSnap] = await Promise.all([
              getDoc(doc(db, "Athlete_Profiles", `ath_${cleanId}`)).catch(() => null),
              getDoc(doc(db, "Athlete_Profiles", cleanId)).catch(() => null),
              getDoc(doc(db, "Users", cleanId)).catch(() => null),
            ]);
            dData = (d1 && d1.exists()) ? d1.data() : (d2 && d2.exists()) ? d2.data() : null;
            uData = (uDocSnap && uDocSnap.exists()) ? uDocSnap.data() : null;

            if (docList.length === 0) {
              if (dData?.eligible_documents && Array.isArray(dData.eligible_documents) && dData.eligible_documents.length > 0) {
                docList = dData.eligible_documents;
              } else if (dData?.documents && Array.isArray(dData.documents) && dData.documents.length > 0) {
                docList = dData.documents;
              }
            }
          } catch (_) {}
        }

        // Dynamically resolve athlete's assigned team ID from Firestore profile
        const athleteTeamId =
          dData?.team_id ||
          dData?.teamId ||
          dData?.current_affiliation?.team_id ||
          uData?.team_id ||
          uData?.teamId ||
          uData?.current_affiliation?.team_id ||
          raw.team_id ||
          raw.teamId ||
          raw.current_affiliation?.team_id ||
          teamObj.team_id ||
          teamRes?.team_id ||
          homeRes?.current_team_summary?.team_id ||
          "";

        // Query Firestore Teams collection dynamically for the live team document
        let dynamicTeamData: any = null;
        if (athleteTeamId) {
          try {
            const teamDocSnap = await getDoc(doc(db, "Teams", athleteTeamId)).catch(() => null);
            if (teamDocSnap && teamDocSnap.exists()) {
              dynamicTeamData = teamDocSnap.data();
            }
          } catch (tErr) {
            console.warn("Dynamic team fetch notice:", tErr);
          }
        }

        const finalTeamId = athleteTeamId;
        const finalTeamName =
          dynamicTeamData?.team_name ||
          dynamicTeamData?.name ||
          teamObj.team_name ||
          teamRes?.team_name ||
          raw.current_affiliation?.team_name ||
          homeRes?.current_team_summary?.team_name ||
          (finalTeamId ? "Assigned Team" : "Unassigned Team");

        const finalSportType = (
          dynamicTeamData?.sport_type ||
          teamObj.sport_type ||
          raw.current_affiliation?.sport_type ||
          raw.sport_type ||
          sportCategory
        ).toUpperCase() as any;

        const finalDivision =
          dynamicTeamData?.division ||
          teamObj.division ||
          raw.current_affiliation?.division ||
          raw.division ||
          "";

        const finalLogoUrl =
          dynamicTeamData?.logo_url ||
          dynamicTeamData?.banner_url ||
          dynamicTeamData?.team_logo ||
          teamObj.logo_url ||
          teamObj.banner_url ||
          teamObj.team_logo ||
          raw.current_affiliation?.logo_url ||
          "";

        let coachId =
          dynamicTeamData?.head_coach?.coach_id ||
          dynamicTeamData?.coach_id ||
          coachObj.coach_id ||
          raw.current_affiliation?.head_coach?.coach_id ||
          "";

        let coachName =
          dynamicTeamData?.head_coach?.full_name ||
          coachObj.full_name ||
          raw.current_affiliation?.head_coach?.full_name ||
          homeRes?.current_team_summary?.coach_name ||
          "No Coach Assigned";

        let coachRole =
          dynamicTeamData?.head_coach?.role_title ||
          coachObj.current_institution ||
          raw.current_affiliation?.head_coach?.role_title ||
          "Head Coach";

        let coachExp =
          dynamicTeamData?.head_coach?.years_experience ||
          raw.current_affiliation?.head_coach?.years_experience ||
          "0 Years";

        let coachQuote =
          dynamicTeamData?.head_coach?.quote ||
          dynamicTeamData?.head_coach?.coachingPhilosophy ||
          raw.current_affiliation?.head_coach?.quote ||
          "";

        let coachAvatar =
          dynamicTeamData?.head_coach?.avatar_url ||
          coachObj.avatar_url ||
          coachObj.profile_image ||
          raw.current_affiliation?.head_coach?.avatar_url ||
          "";

        if (coachId) {
          try {
            const rawCid = String(coachId).replace(/^coach_/, "");
            const canonicalCid = String(coachId).startsWith("coach_") ? coachId : `coach_${rawCid}`;
            const [cDoc, uDocCoach] = await Promise.all([
              getDoc(doc(db, "Coach_Profiles", canonicalCid)).catch(() => null),
              getDoc(doc(db, "Users", rawCid)).catch(() => null),
            ]);
            const liveCoach = (cDoc && cDoc.exists()) ? cDoc.data() : (uDocCoach && uDocCoach.exists()) ? uDocCoach.data() : null;
            if (liveCoach) {
              coachName = (liveCoach.full_name || `${liveCoach.first_name || ""} ${liveCoach.last_name || ""}`.trim() || coachName).toUpperCase();
              coachRole = liveCoach.role_title || liveCoach.current_institution || coachRole;
              coachExp = liveCoach.years_experience || liveCoach.years_of_experience ? `${liveCoach.years_experience || liveCoach.years_of_experience} Years` : coachExp;
              coachQuote = liveCoach.coachingPhilosophy || liveCoach.coaching_philosophy || liveCoach.philosophy || liveCoach.quote || coachQuote;
              coachAvatar = liveCoach.avatar_url || liveCoach.profile_image || coachAvatar;
            }
          } catch (_) {}
        }

        const resolvedProvince = (raw.province || raw.location || raw.user?.province || raw.regional_affiliation || "").replace(/,\s*PH(ILIPPINES)?$/i, "").trim().toUpperCase() || "CAMARINES SUR";

        const mappedProfile: AthleteProfile = {
          athlete_id: raw.athlete_id || raw.user_id || "ath_me",
          first_name: (raw.first_name || raw.user?.first_name || "").toUpperCase(),
          last_name: (raw.last_name || raw.user?.last_name || "").toUpperCase(),
          birthdate: raw.birthdate || raw.birth_date || raw.user?.birthdate || "",
          gender: (raw.gender || raw.user?.gender || "").toUpperCase(),
          province: resolvedProvince,
          category: sportCategory as any,
          height_cm: Number(phys.height_cm ?? phys.height ?? raw.height_cm ?? raw.height ?? 0),
          weight_kg: Number(phys.weight_kg ?? phys.weight ?? raw.weight_kg ?? raw.weight ?? 0),
          wingspan_cm: Number(phys.wingspan_cm ?? phys.wingspan ?? raw.wingspan_cm ?? raw.wingspan ?? 0),
          recruitment_status: raw.recruitment_status || "AVAILABLE",
          leaderboard_rank: raw.leaderboard_rank || "N/A",
          current_affiliation: {
            team_id: finalTeamId,
            team_name: finalTeamName,
            sport_type: finalSportType,
            division: finalDivision,
            logo_url: finalLogoUrl,
            head_coach: {
              coach_id: coachId,
              full_name: coachName.toUpperCase(),
              role_title: coachRole,
              years_experience: coachExp,
              quote: coachQuote,
              avatar_url: coachAvatar,
            },
            is_verified: Boolean(finalTeamId || (raw.current_affiliation?.is_verified ?? raw.is_verified)),
          },
          analytics: {
            points_per_game: Number(
              homeData?.personal_analytics?.ppg ||
              homeRes?.personal_analytics?.ppg ||
              statsRes?.career_averages?.ppg ||
              stats.points_per_game ||
              stats.ppg ||
              stats.points ||
              raw.averages?.ppg ||
              0
            ),
            assists_per_game: Number(
              homeData?.personal_analytics?.apg ||
              homeRes?.personal_analytics?.apg ||
              statsRes?.career_averages?.apg ||
              stats.assists_per_game ||
              stats.apg ||
              stats.assists ||
              stats.ast ||
              raw.averages?.apg ||
              raw.averages?.ast ||
              0
            ),
            rebounds_per_game: Number(
              homeData?.personal_analytics?.rpg ||
              homeRes?.personal_analytics?.rpg ||
              statsRes?.career_averages?.rpg ||
              stats.rebounds_per_game ||
              stats.rpg ||
              stats.rebounds ||
              stats.reb ||
              raw.averages?.rpg ||
              raw.averages?.reb ||
              0
            ),
            field_goal_percentage: Number(
              homeData?.shooting_efficiency?.fg_pct ||
              homeRes?.shooting_efficiency?.fg_pct ||
              statsRes?.shooting_accuracy_percentages?.fg_pct ||
              raw.shooting_efficiency?.fg_pct ||
              raw.averages?.fg_percentage ||
              raw.averages?.fg_pct ||
              stats.field_goal_percentage ||
              stats.fg_pct ||
              stats.fg_percentage ||
              0
            ),
            free_throw_percentage: Number(
              homeData?.shooting_efficiency?.ft_pct ||
              homeRes?.shooting_efficiency?.ft_pct ||
              statsRes?.shooting_accuracy_percentages?.ft_pct ||
              raw.shooting_efficiency?.ft_pct ||
              raw.averages?.ft_percentage ||
              raw.averages?.ft_pct ||
              stats.free_throw_percentage ||
              stats.ft_pct ||
              stats.ft_percentage ||
              0
            ),
            last_5_games_scores: (() => {
              const allScores = [
                ...(Array.isArray(homeData?.last_5_games_scores) ? homeData.last_5_games_scores : []),
                ...(Array.isArray(homeData?.five_game_trend) ? homeData.five_game_trend : []),
                ...(Array.isArray(homeRes?.last_5_games_scores) ? homeRes.last_5_games_scores : []),
                ...(Array.isArray(homeRes?.five_game_trend) ? homeRes.five_game_trend : []),
                ...(Array.isArray(statsRes?.last_5_games_scores) ? statsRes.last_5_games_scores : []),
                ...(Array.isArray(raw.stats?.last_5_games_scores) ? raw.stats.last_5_games_scores : []),
                ...(Array.isArray(raw.averages?.last_5_games_scores) ? raw.averages.last_5_games_scores : []),
                ...(Array.isArray(raw.scoring_trends_last_10) ? raw.scoring_trends_last_10 : []),
                ...(Array.isArray(raw.five_game_trend) ? raw.five_game_trend : []),
                ...(Array.isArray(stats.last_games) ? stats.last_games : []),
                ...(Array.isArray(stats.recent_scores) ? stats.recent_scores : []),
              ].map(Number).filter((s) => typeof s === "number" && !isNaN(s) && s > 0);

              return allScores.length > 0 ? allScores.slice(-5) : [];
            })(),
            // Swimming
            best_time_formatted: finishTime,
            split_time_formatted: splitTime,
            total_distance_m: swimDist,
            lap_count: Number(stats.lap_count ?? 0),
            turn_efficiency_pct: turnEff,
            stroke_efficiency_pct: strokeEff,
            recent_swim_times: swimHistory,
            // Track & Field
            top_sprint_formatted: sprintTime,
            top_distance_m: trackDist,
            average_pace: pace,
            recent_track_marks: trackHistory,
          },
          avatar_url: raw.avatar_url || raw.user?.avatar_url || "",
          workload_analytics: workloadAnalyticsObj,
          eligible_documents: (docList && docList.length > 0)
            ? docList
            : (profile?.eligible_documents && profile.eligible_documents.length > 0)
              ? profile.eligible_documents
              : [],
          auth_provider: raw.provider || raw.auth_provider || raw.user?.provider || "password",
        };
        setProfile(mappedProfile);
      }

      // Sync notification state if available
      const items: NotificationItem[] = [];
      const apiInquiries = inqRes?.inquiries || (Array.isArray(inqRes) ? inqRes : []);
      const apiNotifs = notifRes?.notifications || (Array.isArray(notifRes) ? notifRes : []);
      const processedInquiryIds = new Set<string>();

      // 1. Process API recruitment inquiries first
      apiInquiries.forEach((inq: any) => {
        const scoutId = inq.scout_id || inq.id;
        if (!scoutId || processedInquiryIds.has(scoutId)) return;
        processedInquiryIds.add(scoutId);

        const rawStatus = (inq.offer_status || "Sent").toUpperCase();
        const mappedStatus = rawStatus.includes("ACCEPT") ? "ACCEPTED" : rawStatus.includes("DECLIN") ? "DECLINED" : "PENDING";
        const isSentByAthlete = inq.initiated_by && (inq.initiated_by === inq.athlete_id || inq.initiated_by !== inq.coach_scout_id);
        if (isSentByAthlete && mappedStatus === "PENDING") return;

        const coachName = inq.coach_name || inq.sender_name || inq.sender?.name || inq.coach?.full_name || "Coach";
        const teamName = inq.current_institution || inq.team_name || inq.institution || "Varsity Program";
        const sportName = (inq.sport_type || "BASKETBALL").toUpperCase();

        items.push({
          id: scoutId,
          type: "RECRUITMENT_INQUIRY",
          date_group: "TODAY",
          read_status: mappedStatus !== "PENDING",
          sender: {
            name: coachName,
            role_category: `${sportName} Inquiry`,
          },
          title: isSentByAthlete ? `Inquiry ${mappedStatus}` : `Recruitment Inquiry from Coach ${coachName}`,
          message_body: inq.offer_message || inq.message || `Coach ${coachName} from ${teamName} sent you a recruitment inquiry.`,
          action_label: "View Inquiry",
          inquiry_details: {
            inquiry_id: scoutId,
            coach_id: inq.coach_scout_id || inq.coach_id || "",
            coach_name: coachName,
            role_title: "Head Coach",
            team_name: teamName,
            sport: sportName,
            message: inq.offer_message || inq.message || `Coach ${coachName} has sent you a formal recruitment proposal.`,
            status: mappedStatus,
            is_sent_by_me: Boolean(isSentByAthlete),
          },
        });
      });

      // 2. Process general notifications
      apiNotifs.forEach((n: any) => {
        const rawType = n.type || "ACTION_REQUIRED";
        const isRecruitment = rawType.includes("INQUIRY") || rawType.includes("RECRUITMENT");

        if (isRecruitment && processedInquiryIds.size > 0) {
          return;
        }

        const notifId = n.notification_id || n.id || `notif_${Math.random()}`;
        if (processedInquiryIds.has(notifId)) return;
        processedInquiryIds.add(notifId);

        const coachName = n.sender_name || n.sender?.name || n.metadata?.coach_name || n.metadata?.sender_name || "Coach";
        const teamName = n.metadata?.current_institution || n.metadata?.team_name || "Varsity Program";
        const sportName = (n.metadata?.sport_type || "Basketball").toUpperCase();

        items.push({
          id: notifId,
          type: isRecruitment ? "RECRUITMENT_INQUIRY" : "ACTION_REQUIRED",
          date_group: "TODAY",
          read_status: Boolean(n.is_read),
          sender: isRecruitment ? {
            name: coachName,
            role_category: `${sportName} Inquiry`,
          } : undefined,
          title: n.title || (isRecruitment ? `Recruitment Inquiry from Coach ${coachName}` : "Action Required"),
          message_body: n.message || n.message_body || (isRecruitment ? `Coach ${coachName} sent you a recruitment inquiry.` : ""),
          action_label: isRecruitment ? "View Inquiry" : "Upload Now ->",
          inquiry_details: isRecruitment ? {
            inquiry_id: n.metadata?.scout_id || notifId,
            coach_id: n.metadata?.coach_id || n.sender_id || "",
            coach_name: coachName,
            role_title: "Head Coach",
            team_name: teamName,
            sport: sportName,
            message: n.metadata?.message || n.message || `Coach ${coachName} has sent you a formal recruitment proposal.`,
            status: "PENDING",
            is_sent_by_me: false,
          } : undefined,
        });
      });

      setNotifications(items);
    } catch (error) {
      // Token authentication fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Immediately hydrate cached profile so dashboard is responsive in <10ms
    (async () => {
      try {
        const cached = await getAthleteProfileOfflineFirst();
        if (cached && (cached.athlete_id || cached.first_name)) {
          setProfile((prev) => ({ ...prev, ...cached }));
          setLoading(false);
        }
      } catch (_) {}
    })();

    // 2. Fetch live athlete data
    refreshAthleteData(true);
  }, [refreshAthleteData]);

  useEffect(() => {
    if (activeTab === "HOME" || activeTab === "PROFILE") {
      refreshAthleteData(false);
    }
  }, [activeTab, refreshAthleteData]);

  const sanitizeFirestoreData = (val: any): any => {
    if (val === undefined || val === null) return null;
    if (Array.isArray(val)) {
      return val.map(sanitizeFirestoreData).filter((v) => v !== undefined);
    }
    if (typeof val === "object" && !(val instanceof Date)) {
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) {
          const cleaned = sanitizeFirestoreData(v);
          if (cleaned !== undefined) {
            res[k] = cleaned;
          }
        }
      }
      return res;
    }
    return val;
  };

  const handleUpdateProfile = (updatedProfile: AthleteProfile) => {
    setProfile(updatedProfile);
    AsyncStorage.setItem(OFFLINE_ATHLETE_PROFILE_CACHE_KEY, JSON.stringify(updatedProfile)).catch(() => null);

    const athleteUid = updatedProfile.athlete_id || (updatedProfile as any).user_id;
    if (athleteUid) {
      try {
        const cleanId = String(athleteUid).replace(/^ath_/, "");
        const canonicalId = String(athleteUid).startsWith("ath_") ? athleteUid : `ath_${cleanId}`;
        const payload = sanitizeFirestoreData({
          first_name: updatedProfile.first_name,
          last_name: updatedProfile.last_name,
          birthdate: updatedProfile.birthdate,
          gender: updatedProfile.gender,
          province: updatedProfile.province,
          category: updatedProfile.category,
          height_cm: updatedProfile.height_cm,
          weight_kg: updatedProfile.weight_kg,
          wingspan_cm: updatedProfile.wingspan_cm,
          avatar_url: updatedProfile.avatar_url,
          eligible_documents: updatedProfile.eligible_documents,
          updated_at: new Date().toISOString(),
        });
        setDoc(doc(db, "Athlete_Profiles", canonicalId), payload, { merge: true }).catch(() => null);
      } catch (err) {
        console.warn("AthleteHomePage handleUpdateProfile setDoc error:", err);
      }
    }
  };

  const handleUploadDocumentFromNotification = (docInfo: {
    document_name: string;
    required_type: string;
    fileName: string;
    fileUri?: string;
  }) => {
    const todayStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).toUpperCase();

    const currentDocs = profile.eligible_documents || DEFAULT_ELIGIBLE_DOCS;
    let found = false;

    const updatedDocs = currentDocs.map((docItem) => {
      const isMatchCategory =
        docItem.category === docInfo.required_type ||
        (docInfo.required_type === "BIRTH_CERTIFICATE" && docItem.category === "BIRTH_CERTIFICATE");
      const isMatchTitle =
        docItem.title.toLowerCase().includes("psa") ||
        docItem.title.toLowerCase().includes("birth") ||
        docItem.title.toLowerCase().includes(docInfo.document_name.toLowerCase());

      if (isMatchCategory || isMatchTitle) {
        found = true;
        return {
          ...docItem,
          fileName: docInfo.fileName,
          fileUri: docInfo.fileUri,
          status: "UPLOADED" as const,
          uploadedAt: todayStr,
        };
      }
      return docItem;
    });

    if (!found) {
      updatedDocs.push({
        id: `doc_${Date.now()}`,
        title: docInfo.document_name,
        category: (docInfo.required_type as any) || "OTHER",
        fileName: docInfo.fileName,
        fileUri: docInfo.fileUri,
        status: "UPLOADED" as const,
        uploadedAt: todayStr,
      });
    }

    const updatedProfile: AthleteProfile = {
      ...profile,
      eligible_documents: updatedDocs,
    };

    setProfile(updatedProfile);
    AsyncStorage.setItem(OFFLINE_ATHLETE_PROFILE_CACHE_KEY, JSON.stringify(updatedProfile)).catch(() => null);

    const athleteUid = updatedProfile.athlete_id || (updatedProfile as any).user_id;
    if (athleteUid) {
      try {
        const cleanId = String(athleteUid).replace(/^ath_/, "");
        const canonicalId = String(athleteUid).startsWith("ath_") ? athleteUid : `ath_${cleanId}`;
        const payload = sanitizeFirestoreData({
          eligible_documents: updatedDocs,
          updated_at: new Date().toISOString(),
        });
        setDoc(doc(db, "Athlete_Profiles", canonicalId), payload, { merge: true }).catch(() => null);
      } catch (err) {
        console.warn("AthleteHomePage handleUploadDocumentFromNotification setDoc error:", err);
      }
    }

    refreshAthleteData(false);
  };

  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top, 16) + 10;

  const unreadCount = notifications.filter((n) => !n.read_status).length;

  if (showNotifications) {
    return (
      <NotificationPage
        onBack={() => setShowNotifications(false)}
        notifications={notifications.length > 0 ? notifications : undefined}
        onNotificationsChange={setNotifications}
        onUploadDocumentSuccess={handleUploadDocumentFromNotification}
      />
    );
  }

  if (loading) {
    return <AthleteHomePageSkeleton />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header Bar */}
      {!hideParentBars && (
        <View style={[styles.topHeaderBar, { paddingTop: headerTopPadding }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AtletaAnimatedLogo size={30} showGlow={false} pulse={false} />
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 20,
                fontWeight: "900",
                letterSpacing: 2.5,
                includeFontPadding: false,
              }}
            >
              ATLETA
            </Text>
          </View>
          <Pressable
            style={styles.notificationButton}
            onPress={() => setShowNotifications(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Notifications"
          >
            <Image
              source={require("../../../../assets/notification.png")}
              style={styles.notificationIcon}
              resizeMode="contain"
            />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      {/* Main Active Screen Body */}
      <View style={[styles.screenContainer, { paddingTop: !hideParentBars ? headerTopPadding + 74 : 0 }]}>
        {activeTab === "HOME" &&
          (dashboardScreen === "TEAM_PROFILE" ? (
            <TeamProfileScreen
              teamId={profile.current_affiliation?.team_id}
              onBack={() => {
                setDashboardScreen("HOME_MAIN");
                setHideParentBars(false);
              }}
              onViewCoachProfile={(coachId) => {
                if (coachId) setSelectedCoachId(coachId);
                setDashboardScreen("COACH_PROFILE");
                setHideParentBars(true);
              }}
            />
          ) : dashboardScreen === "COACH_PROFILE" ? (
            <CoachProfileScreen
              coachId={selectedCoachId || profile.current_affiliation?.head_coach?.coach_id}
              onBack={() => {
                setDashboardScreen("HOME_MAIN");
                setHideParentBars(false);
              }}
            />
          ) : loading ? (
            <AthleteHomePageSkeleton />
          ) : (
            <HomeAnalyticsPage
              profile={profile}
              loading={loading}
              onNavigateToProfile={() => setActiveTab("PROFILE")}
              onNavigateToCoaches={() => setActiveTab("COACHES")}
              onNavigateToTeamProfile={() => {
                setDashboardScreen("TEAM_PROFILE");
                setHideParentBars(true);
              }}
              onViewCoachProfile={(coachId) => {
                if (coachId) setSelectedCoachId(coachId);
                setDashboardScreen("COACH_PROFILE");
                setHideParentBars(true);
              }}
            />
          ))}

        {activeTab === "PROFILE" && (
          <AthleteProfilePage
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            onLogout={onLogout}
            loading={loading}
          />
        )}

        {activeTab === "COACHES" && (
          <Teams
            onNavigateTab={(tab) => setActiveTab(tab)}
            onScreenStateChange={(isSubScreen) => setHideParentBars(isSubScreen)}
            athleteCategory={profile.category}
          />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      {!hideParentBars && (
        <View style={styles.bottomTabBar}>
        {/* HOME TAB */}
        <Pressable
          style={styles.tabButton}
          onPress={() => setActiveTab("HOME")}
        >
          <Image
            source={require("../../../../assets/Home.png")}
            style={[
              styles.tabIcon,
              activeTab === "HOME" ? styles.tabIconActive : styles.tabIconInactive,
            ]}
            resizeMode="contain"
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "HOME" ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            HOME
          </Text>
        </Pressable>

        {/* COACHES TAB */}
        <Pressable
          style={styles.tabButton}
          onPress={() => setActiveTab("COACHES")}
        >
          <Image
            source={require("../../../../assets/Coaches.png")}
            style={[
              styles.tabIcon,
              activeTab === "COACHES" ? styles.tabIconActive : styles.tabIconInactive,
            ]}
            resizeMode="contain"
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "COACHES" ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            COACHES
          </Text>
        </Pressable>

        {/* PROFILE TAB */}
        <Pressable
          style={styles.tabButton}
          onPress={() => setActiveTab("PROFILE")}
        >
          <Image
            source={require("../../../../assets/profile.png")}
            style={[
              styles.tabIcon,
              activeTab === "PROFILE" ? styles.tabIconActive : styles.tabIconInactive,
            ]}
            resizeMode="contain"
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "PROFILE" ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            PROFILE
          </Text>
        </Pressable>
      </View>
      )}
    </View>
  );
}

export const AthleteMainPage = AthleteHomePage;

