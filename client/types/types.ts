
export type UResponse = {
	msg: string;
	user: {
		id:number,
		username:string,
		email: string;
		avatarurl?: string | null;
		status: string;
		alias: string | null;
		createdAt: string;
	};
	accessToken: string;
}

export type AuthState = {
	user: UResponse | null;
	loading: boolean;
	error: string | null;
};

export type Action = 
  | { type: 'Start_Login'}
  | { type: 'Success_Login', payload: UResponse }
  | { type: 'Failed_Login', payload: string }
  | { type: 'Persist_Login', payload: UResponse}
  | { type: 'Update_User_Alias', payload: string | null}


export type ContextType = {
	state: AuthState,
	dispatch: React.Dispatch<Action>,
	persist: boolean,
	setPersist: React.Dispatch<React.SetStateAction<boolean>>,
	lang: string,
	setLang: React.Dispatch<React.SetStateAction<string>>
}
