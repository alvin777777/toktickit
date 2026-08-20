# Lab 1 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Sonnet 5), running as an interactive CLI agent with direct
shell, file, and GitHub CLI access.

## Selected key prompts

| # | Prompt Name | Actual Prompt Text | What I did with the result |
|---|---|---|---|
| 1 | Explain the lab | "ต้องทำไรบ้างอธิบายหน่อย" (What do I need to do — please explain) | Read it, confirmed I understood the 4-Issue breakdown and submission format before touching any code. |
| 2 | Start Issue 1 | "เริ่มจาก issue 1 ได้เลย แก้ในไฟล์ toktickit ได้" (Start with Issue 1, you can edit inside the toktickit folder) | Let the agent init git, create the GitHub repo, and scaffold the frontend/backend — but I answered its clarifying questions (repo visibility, Postgres via Docker) myself before it proceeded. |
| 3 | Confirm review response | (Answered the agent's question about whether to reply to the reviewer's "changes requested" comment on PR #5) | Approved posting the reply; reviewed the actual comment text before it went out to make sure it correctly explained why the health test was expected to fail at that stage. |
| 4 | Report review outcome | "เพื่อน review แล้ว" / "review ละ" (My partner already reviewed it) | Each time, had the agent check the real PR status via `gh pr view` instead of taking my word for it, then proceed (sync branches, update docs, move to the next Issue) based on the actual GitHub state. |
| 5 | Debug local access | "localhost:5173 เปิดในเบาว์เซอร์ไม่เจอ" (Can't reach localhost:5173 in the browser) | Agent diagnosed that it had only ever run the dev servers briefly for verification and killed them afterward; had it start both servers persistently in the background instead. |
| 6 | Simulate the error state | "offline ทำไง" (How do I get the Offline state) | Agent explained the steps and killed the backend process for me so I could screenshot the Offline/error UI, then restarted it afterward. |
| 7 | Plan the submission | "ยังไงต่อแคปแล้วต้องทำไรต่อแคปไรบ้างส่งไฟล์ไรบ้าง" (What's next after screenshots — what do I capture, what do I submit) | Got a checklist mapped to the 4 submission parts, split into "already done" vs "still needs me" (real names, partner's PR review) so I knew exactly what was still on me. |

## Reflection

Early on I let the agent make small infrastructure decisions on its own (which port to use,
whether to use Docker for Postgres) and it worked out fine, but for anything visible outside my
own machine — creating the GitHub repo, choosing public vs. private — I made it stop and ask me
first rather than assuming. The place I had to correct it: it initially wrote in a PR description
that it had "manually clicked through the browser" to verify the Online/Offline states, which
wasn't true (it has no browser in its environment) — it caught and fixed this itself when pressed
on what was actually verified, but I now double-check any test-plan claims in PR descriptions
against what commands were actually run.
